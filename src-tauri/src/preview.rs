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
/// Uncompressed thumbnail bytes. A larger inflate is skipped.
const MAX_BGCODE_INFLATE: u64 = 4 * 1024 * 1024;

#[derive(Debug)]
pub enum ThumbFail {
    Decode(String),
    Io(String),
}

pub fn extract_thumbnail_png(path: &Path) -> Result<Option<Vec<u8>>, ThumbFail> {
    let Some(name) = path.file_name() else {
        return Ok(None);
    };
    let ext = extension_of(&name.to_string_lossy());
    match ext.as_str() {
        "png" | "jpg" | "jpeg" => load_image_file(path).map(Some),
        "ctb" => Ok(read_limited(path, 32 * 1024 * 1024)
            .and_then(|bytes| ctb::extract_preview_png(&bytes))
            .and_then(|raw| fit_png(&raw))),
        "3mf" => Ok(zip_preview(path, true)),
        "lys" | "chitubox" | "ags" | "zip" | "f3d" => Ok(zip_preview(path, false)),
        "gcode" => Ok(gcode_preview(path)),
        "bgcode" => Ok(bgcode_preview(path)),
        _ => Ok(None),
    }
}

fn load_image_file(path: &Path) -> Result<Vec<u8>, ThumbFail> {
    let img = image::open(path).map_err(thumb_fail)?;
    encode_fit(img).ok_or_else(|| ThumbFail::Decode("Could not encode a thumbnail.".into()))
}

fn thumb_fail(err: image::ImageError) -> ThumbFail {
    match err {
        image::ImageError::IoError(err) => ThumbFail::Io(err.to_string()),
        other => ThumbFail::Decode(other.to_string()),
    }
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
                1 | 2 | 3 => match inflate_capped(payload, uncompressed) {
                    Some(out) => out,
                    None => continue,
                },
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

/// Inflate a bgcode thumbnail, stopping once the output passes the cap.
/// A header that claims more than the cap, or a stream that expands past it, skips the thumbnail.
fn inflate_capped(payload: &[u8], claimed: usize) -> Option<Vec<u8>> {
    if claimed as u64 > MAX_BGCODE_INFLATE {
        return None;
    }
    let mut out = Vec::new();
    let mut limited = DeflateDecoder::new(payload).take(MAX_BGCODE_INFLATE + 1);
    limited.read_to_end(&mut out).ok()?;
    if out.len() as u64 > MAX_BGCODE_INFLATE {
        return None;
    }
    Some(out)
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;

    fn bgcode_bytes(compression: u16, uncompressed: u32, payload: &[u8]) -> Vec<u8> {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"GCDE");
        bytes.extend_from_slice(&1u32.to_le_bytes());
        bytes.extend_from_slice(&0u16.to_le_bytes());
        bytes.extend_from_slice(&5u16.to_le_bytes());
        bytes.extend_from_slice(&compression.to_le_bytes());
        bytes.extend_from_slice(&uncompressed.to_le_bytes());
        bytes.extend_from_slice(&(payload.len() as u32).to_le_bytes());
        bytes.extend_from_slice(payload);
        bytes
    }

    fn scratch(name: &str) -> std::path::PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("filelib-preview-{name}-{}-{nanos}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write_png(path: &Path, width: u32, height: u32) {
        let img = image::RgbImage::from_pixel(width, height, image::Rgb([20, 40, 60]));
        img.save(path).unwrap();
    }

    fn long_edge(png: &[u8]) -> (u32, u32) {
        let img = image::load_from_memory(png).unwrap();
        (img.width(), img.height())
    }

    #[test]
    fn large_png_long_edge_is_256_and_small_png_is_not_upscaled() {
        let dir = scratch("png");
        let large = dir.join("wide.png");
        let small = dir.join("tiny.png");
        write_png(&large, 300, 100);
        write_png(&small, 16, 16);
        let large_png = extract_thumbnail_png(&large).unwrap().unwrap();
        let (w, h) = long_edge(&large_png);
        assert_eq!(w.max(h), 256);
        assert!(w <= 256 && h <= 256);
        let small_png = extract_thumbnail_png(&small).unwrap().unwrap();
        assert_eq!(long_edge(&small_png), (16, 16));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn baseline_jpeg_long_edge_is_256() {
        let dir = scratch("jpeg");
        let path = dir.join("base.jpg");
        fs::write(&path, include_bytes!("../tests/fixtures/baseline.jpg")).unwrap();
        let png = extract_thumbnail_png(&path).unwrap().unwrap();
        let (w, h) = long_edge(&png);
        assert_eq!(w.max(h), 256);
        assert!(w <= 256 && h <= 256);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn truncated_jpeg_is_a_decode_error() {
        let dir = scratch("trunc");
        let path = dir.join("broken.jpg");
        fs::write(&path, b"\xFF\xD8\xFF\xD9not-a-jpeg").unwrap();
        let err = extract_thumbnail_png(&path).unwrap_err();
        assert!(matches!(err, ThumbFail::Decode(_)), "{err:?}");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn missing_jpeg_is_an_io_error() {
        let err = extract_thumbnail_png(Path::new("/tmp/filelib-missing-thumb.jpg")).unwrap_err();
        assert!(matches!(err, ThumbFail::Io(_)), "{err:?}");
    }

    #[test]
    fn progressive_jpeg_fits_or_returns_decode() {
        let dir = scratch("prog");
        let path = dir.join("prog.jpg");
        fs::write(&path, include_bytes!("../tests/fixtures/progressive.jpg")).unwrap();
        match extract_thumbnail_png(&path) {
            Ok(Some(png)) => {
                let (w, h) = long_edge(&png);
                assert!(w <= 256 && h <= 256);
            }
            Err(ThumbFail::Decode(_)) => {}
            other => panic!("unexpected thumbnail result: {other:?}"),
        }
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn find_3mf_image_prefers_metadata_thumbnail() {
        let names = vec![
            (0usize, "3d/model.model".into()),
            (1, "metadata/plate_1.png".into()),
            (2, "metadata/thumbnail.png".into()),
        ];
        assert_eq!(find_3mf_image(&names), Some(2));
    }

    #[test]
    fn zip_3mf_thumbnail_and_gcode_thumbnail_decode() {
        let dir = scratch("archive");
        let png_path = dir.join("src.png");
        write_png(&png_path, 32, 16);
        let png = fs::read(&png_path).unwrap();

        let mf = dir.join("model.3mf");
        let file = fs::File::create(&mf).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        zip.start_file("Metadata/thumbnail.png", zip::write::SimpleFileOptions::default())
            .unwrap();
        zip.write_all(&png).unwrap();
        zip.finish().unwrap();
        assert!(extract_thumbnail_png(&mf).unwrap().is_some());

        let b64 = base64::engine::general_purpose::STANDARD.encode(&png);
        let gcode = dir.join("print.gcode");
        fs::write(
            &gcode,
            format!("; thumbnail begin 32x16 {}\n; {b64}\n; thumbnail end\n", b64.len()),
        )
        .unwrap();
        let bytes = largest_gcode_thumbnail(&fs::read_to_string(&gcode).unwrap()).unwrap();
        assert_eq!(bytes, png);
        assert!(extract_thumbnail_png(&gcode).unwrap().is_some());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn bgcode_block_returns_png_and_other_magic_returns_none() {
        let dir = scratch("bgcode");
        let png_path = dir.join("src.png");
        write_png(&png_path, 8, 8);
        let png = fs::read(&png_path).unwrap();
        let mut raw = Vec::new();
        raw.extend_from_slice(&0u16.to_le_bytes());
        raw.extend_from_slice(&0u16.to_le_bytes());
        raw.extend_from_slice(&0u16.to_le_bytes());
        raw.extend_from_slice(&png);
        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"GCDE");
        bytes.extend_from_slice(&1u32.to_le_bytes());
        bytes.extend_from_slice(&0u16.to_le_bytes());
        let len = raw.len() as u32;
        bytes.extend_from_slice(&5u16.to_le_bytes());
        bytes.extend_from_slice(&0u16.to_le_bytes());
        bytes.extend_from_slice(&len.to_le_bytes());
        bytes.extend_from_slice(&len.to_le_bytes());
        bytes.extend_from_slice(&raw);
        let bg = dir.join("print.bgcode");
        fs::write(&bg, &bytes).unwrap();
        assert!(extract_thumbnail_png(&bg).unwrap().is_some());
        let nope = dir.join("nope.bgcode");
        fs::write(&nope, b"NOPE rest of file").unwrap();
        assert!(bgcode_preview(&nope).is_none());

        let mut encoder = flate2::write::DeflateEncoder::new(Vec::new(), flate2::Compression::fast());
        encoder.write_all(&raw).unwrap();
        let compressed = encoder.finish().unwrap();
        let packed = bgcode_bytes(1, raw.len() as u32, &compressed);
        let deflated = dir.join("deflated.bgcode");
        fs::write(&deflated, &packed).unwrap();
        assert!(extract_thumbnail_png(&deflated).unwrap().is_some());

        let mut bomb = flate2::write::DeflateEncoder::new(Vec::new(), flate2::Compression::fast());
        bomb.write_all(&vec![0u8; (MAX_BGCODE_INFLATE as usize) + 64]).unwrap();
        let bomb_bytes = bomb.finish().unwrap();
        let over = dir.join("bomb.bgcode");
        fs::write(&over, bgcode_bytes(1, 32, &bomb_bytes)).unwrap();
        assert!(bgcode_preview(&over).is_none());
        let claimed = dir.join("claimed.bgcode");
        fs::write(&claimed, bgcode_bytes(1, (MAX_BGCODE_INFLATE as u32) + 1, &compressed)).unwrap();
        assert!(bgcode_preview(&claimed).is_none());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn stl_has_no_embedded_thumbnail() {
        let dir = scratch("stl");
        let path = dir.join("mesh.stl");
        fs::write(&path, b"solid mesh\nendsolid mesh\n").unwrap();
        assert!(extract_thumbnail_png(&path).unwrap().is_none());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn f3d_zip_thumbnail_and_step_has_no_embedded_thumbnail() {
        let dir = scratch("f3d-step");
        let png_path = dir.join("src.png");
        write_png(&png_path, 16, 16);
        let png = fs::read(&png_path).unwrap();

        let f3d = dir.join("design.f3d");
        let file = fs::File::create(&f3d).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        zip.start_file("preview.png", zip::write::SimpleFileOptions::default())
            .unwrap();
        zip.write_all(&png).unwrap();
        zip.finish().unwrap();
        assert!(extract_thumbnail_png(&f3d).unwrap().is_some());

        let step = dir.join("part.step");
        fs::write(&step, b"ISO-10303-21;\n").unwrap();
        assert!(extract_thumbnail_png(&step).unwrap().is_none());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn png_from_bytes_accepts_a_png_and_rejects_garbage() {
        let img = image::RgbaImage::from_pixel(2, 2, image::Rgba([1, 2, 3, 255]));
        let mut bytes = Vec::new();
        image::DynamicImage::ImageRgba8(img)
            .write_to(&mut std::io::Cursor::new(&mut bytes), image::ImageFormat::Png)
            .unwrap();
        assert!(png_from_bytes(&bytes).is_some());
        assert!(png_from_bytes(b"").is_none());
        assert!(png_from_bytes(b"GIF89a").is_none());
    }
}
