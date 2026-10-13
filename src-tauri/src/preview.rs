use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

use base64::Engine;
use flate2::read::DeflateDecoder;
use image::imageops::FilterType;
use image::DynamicImage;
use zip::ZipArchive;

use crate::ctb;
use crate::names::extension_of;

const MAX_EDGE: u32 = 256;

pub fn extract_thumbnail_png(path: &Path) -> Option<Vec<u8>> {
    let ext = extension_of(&path.file_name()?.to_string_lossy());
    let png = match ext.as_str() {
        "png" | "jpg" | "jpeg" => load_image_file(path)?,
        "ctb" => {
            let bytes = read_limited(path, 32 * 1024 * 1024)?;
            let raw = ctb::extract_preview_png(&bytes)?;
            fit_png(&raw)?
        }
        "3mf" => zip_preview(path, true)?,
        "lys" | "chitubox" | "ags" | "zip" => zip_preview(path, false)?,
        "gcode" => gcode_preview(path)?,
        "bgcode" => bgcode_preview(path)?,
        _ => return None,
    };
    Some(png)
}

fn load_image_file(path: &Path) -> Option<Vec<u8>> {
    let img = image::open(path).ok()?;
    encode_fit(img)
}

fn fit_png(png: &[u8]) -> Option<Vec<u8>> {
    let img = image::load_from_memory(png).ok()?;
    encode_fit(img)
}

fn encode_fit(img: DynamicImage) -> Option<Vec<u8>> {
    let img = if img.width() > MAX_EDGE || img.height() > MAX_EDGE {
        img.resize(MAX_EDGE, MAX_EDGE, FilterType::Triangle)
    } else {
        img
    };
    let mut out = Vec::new();
    img.write_to(
        &mut std::io::Cursor::new(&mut out),
        image::ImageFormat::Png,
    )
    .ok()?;
    Some(out)
}

fn zip_preview(path: &Path, prefer_3mf: bool) -> Option<Vec<u8>> {
    let file = File::open(path).ok()?;
    let mut archive = ZipArchive::new(file).ok()?;
    let mut names = Vec::new();
    for i in 0..archive.len() {
        if let Ok(entry) = archive.by_index(i) {
            names.push((i, entry.name().replace('\\', "/").to_lowercase()));
        }
    }
    let pick = if prefer_3mf {
        find_3mf_image(&names)
    } else {
        find_any_image(&names)
    }?;
    let mut entry = archive.by_index(pick).ok()?;
    if entry.size() > 30 * 1024 * 1024 {
        return None;
    }
    let mut buf = Vec::new();
    entry.read_to_end(&mut buf).ok()?;
    fit_png(&buf).or_else(|| {
        image::load_from_memory(&buf)
            .ok()
            .and_then(encode_fit)
    })
}

fn find_3mf_image(names: &[(usize, String)]) -> Option<usize> {
    let ranked = [
        |n: &str| n.ends_with("metadata/thumbnail.png"),
        |n: &str| n.contains("metadata/plate_") && n.ends_with(".png"),
        |n: &str| n.ends_with("thumbnail.png") || n.ends_with("thumbnail.jpg"),
        |n: &str| n.ends_with(".png") || n.ends_with(".jpg") || n.ends_with(".jpeg"),
    ];
    for pred in ranked {
        if let Some((idx, _)) = names.iter().find(|(_, n)| pred(n)) {
            return Some(*idx);
        }
    }
    None
}

fn find_any_image(names: &[(usize, String)]) -> Option<usize> {
    names
        .iter()
        .find(|(_, n)| n.ends_with(".png") || n.ends_with(".jpg") || n.ends_with(".jpeg"))
        .map(|(i, _)| *i)
}

fn gcode_preview(path: &Path) -> Option<Vec<u8>> {
    let text = read_gcode_text(path)?;
    let bytes = largest_gcode_thumbnail(&text)?;
    fit_png(&bytes).or_else(|| image::load_from_memory(&bytes).ok().and_then(encode_fit))
}

fn read_gcode_text(path: &Path) -> Option<String> {
    let mut file = File::open(path).ok()?;
    let len = file.metadata().ok()?.len();
    let mut head = vec![0u8; (len.min(4 * 1024 * 1024)) as usize];
    let n = file.read(&mut head).ok()?;
    head.truncate(n);
    let mut text = String::from_utf8_lossy(&head).into_owned();
    if len > 6 * 1024 * 1024 {
        let tail_len = 2 * 1024 * 1024;
        file.seek(SeekFrom::End(-(tail_len as i64))).ok()?;
        let mut tail = Vec::new();
        file.read_to_end(&mut tail).ok()?;
        text.push_str(&String::from_utf8_lossy(&tail));
    }
    Some(text)
}

fn largest_gcode_thumbnail(text: &str) -> Option<Vec<u8>> {
    let mut best: Option<(u64, Vec<u8>)> = None;
    let lower = text;
    let mut search_from = 0;
    while let Some(rel) = lower[search_from..].find("thumbnail begin") {
        let start = search_from + rel;
        let line_end = lower[start..].find('\n').map(|p| start + p).unwrap_or(lower.len());
        let header = &lower[start..line_end];
        let area = header_area(header);
        let body_start = line_end + 1;
        let end_rel = lower[body_start..].find("thumbnail end")?;
        let body = &lower[body_start..body_start + end_rel];
        let mut b64 = String::new();
        for line in body.lines() {
            let trimmed = line.trim().trim_start_matches(';').trim();
            if !trimmed.is_empty() {
                b64.push_str(trimmed);
            }
        }
        if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(b64.trim()) {
            if best.as_ref().map(|(a, _)| area > *a).unwrap_or(true) {
                best = Some((area, bytes));
            }
        }
        search_from = body_start + end_rel;
    }
    best.map(|(_, b)| b)
}

fn header_area(header: &str) -> u64 {
    let mut parts = header.split_whitespace();
    let _ = parts.next();
    let _ = parts.next();
    if let Some(dim) = parts.next() {
        if let Some((w, h)) = dim.split_once('x') {
            let w: u64 = w.parse().unwrap_or(1);
            let h: u64 = h.parse().unwrap_or(1);
            return w * h;
        }
    }
    1
}

fn bgcode_preview(path: &Path) -> Option<Vec<u8>> {
    let bytes = read_limited(path, 64 * 1024 * 1024)?;
    if bytes.len() < 16 || &bytes[0..4] != b"GCDE" {
        return None;
    }
    let checksum = u16::from_le_bytes(bytes[8..10].try_into().ok()?);
    let mut pos = 10usize;
    while pos + 12 <= bytes.len() {
        let kind = u16::from_le_bytes(bytes[pos..pos + 2].try_into().ok()?);
        let compression = u16::from_le_bytes(bytes[pos + 2..pos + 4].try_into().ok()?);
        let uncompressed = u32::from_le_bytes(bytes[pos + 4..pos + 8].try_into().ok()?) as usize;
        let compressed = u32::from_le_bytes(bytes[pos + 8..pos + 12].try_into().ok()?) as usize;
        pos += 12;
        if pos + compressed > bytes.len() {
            break;
        }
        let payload = &bytes[pos..pos + compressed];
        pos += compressed;
        if checksum == 1 {
            pos += 4;
        }
        if kind == 5 {
            let raw = match compression {
                0 => payload.to_vec(),
                1 | 2 | 3 => {
                    let mut decoder = DeflateDecoder::new(payload);
                    let mut out = Vec::new();
                    decoder.read_to_end(&mut out).ok()?;
                    out
                }
                _ => continue,
            };
            if raw.len() < 6 {
                continue;
            }
            let format = u16::from_le_bytes(raw[0..2].try_into().ok()?);
            let data = &raw[6..];
            if uncompressed > 6 && data.len() > uncompressed - 6 {
                let data = &data[..uncompressed - 6];
                if format == 0 || format == 1 {
                    return fit_png(data).or_else(|| image::load_from_memory(data).ok().and_then(encode_fit));
                }
            } else if format == 0 || format == 1 {
                return fit_png(data).or_else(|| image::load_from_memory(data).ok().and_then(encode_fit));
            }
        }
    }
    None
}

fn read_limited(path: &Path, max: u64) -> Option<Vec<u8>> {
    let mut file = File::open(path).ok()?;
    let len = file.metadata().ok()?.len();
    if len > max {
        return None;
    }
    let mut buf = Vec::new();
    file.read_to_end(&mut buf).ok()?;
    Some(buf)
}

pub fn png_from_bytes(bytes: &[u8]) -> Option<Vec<u8>> {
    let img = image::load_from_memory(bytes).ok()?;
    encode_fit(img)
}
