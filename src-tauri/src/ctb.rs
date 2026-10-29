use image::{Rgba, RgbaImage};

const MAGIC_CTB: u32 = 0x12FD_0086;
const MAGIC_CBDDLP: u32 = 0x12FD_0019;

pub fn extract_preview_png(bytes: &[u8]) -> Option<Vec<u8>> {
    if bytes.len() < 72 {
        return None;
    }
    let magic = u32::from_le_bytes(bytes[0..4].try_into().ok()?);
    if magic != MAGIC_CTB && magic != MAGIC_CBDDLP {
        return None;
    }
    let large_off = u32::from_le_bytes(bytes[56..60].try_into().ok()?) as usize;
    let image = decode_preview(bytes, large_off)
        .or_else(|| {
            let small_off = u32::from_le_bytes(bytes[68..72].try_into().ok()?) as usize;
            decode_preview(bytes, small_off)
        })?;
    let mut png = Vec::new();
    let dyn_img = image::DynamicImage::ImageRgba8(image);
    dyn_img
        .write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
        .ok()?;
    Some(png)
}

fn decode_preview(bytes: &[u8], header_off: usize) -> Option<RgbaImage> {
    if header_off + 16 > bytes.len() {
        return None;
    }
    let width = u32::from_le_bytes(bytes[header_off..header_off + 4].try_into().ok()?);
    let height = u32::from_le_bytes(bytes[header_off + 4..header_off + 8].try_into().ok()?);
    let data_off = u32::from_le_bytes(bytes[header_off + 8..header_off + 12].try_into().ok()?) as usize;
    let data_len = u32::from_le_bytes(bytes[header_off + 12..header_off + 16].try_into().ok()?) as usize;
    if width == 0 || height == 0 || width > 4096 || height > 4096 {
        return None;
    }
    if data_off + data_len > bytes.len() {
        return None;
    }
    decode_rle15(&bytes[data_off..data_off + data_len], width, height)
}

fn decode_rle15(data: &[u8], width: u32, height: u32) -> Option<RgbaImage> {
    let total = (width as usize).checked_mul(height as usize)?;
    let mut img = RgbaImage::from_pixel(width, height, Rgba([0, 0, 0, 255]));
    let mut written = 0usize;
    let mut i = 0usize;
    while i + 1 < data.len() && written < total {
        let word = u16::from_le_bytes([data[i], data[i + 1]]);
        i += 2;
        let (r, g, b) = rgb565(word);
        let run = if (word >> 5) & 1 == 1 {
            if i + 1 >= data.len() {
                break;
            }
            let len_word = u16::from_le_bytes([data[i], data[i + 1]]);
            i += 2;
            (len_word & 0x0fff) as usize
        } else {
            1
        };
        let run = run.max(1);
        for _ in 0..run {
            if written >= total {
                break;
            }
            let x = (written as u32) % width;
            let y = (written as u32) / width;
            img.put_pixel(x, y, Rgba([r, g, b, 255]));
            written += 1;
        }
    }
    if written == 0 {
        None
    } else {
        Some(img)
    }
}

fn rgb565(word: u16) -> (u8, u8, u8) {
    let r = ((word >> 11) & 0x1f) as u8;
    let g = ((word >> 6) & 0x1f) as u8;
    let b = (word & 0x1f) as u8;
    (r << 3, g << 3, b << 3)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rgb565_expands_five_bit_channels() {
        assert_eq!(rgb565(0xF800), (0xF8, 0, 0));
        assert_eq!(rgb565(0x07E0), (0, 0xF8, 0));
        assert_eq!(rgb565(0x001F), (0, 0, 0xF8));
    }

    #[test]
    fn decode_rle15_handles_empty_and_short_data() {
        assert!(decode_rle15(&[], 2, 2).is_none());
        let img = decode_rle15(&[0x00, 0xF8], 2, 2).expect("partial image");
        assert_eq!(img.get_pixel(0, 0).0, [0xF8, 0, 0, 255]);
        assert_eq!(img.get_pixel(1, 1).0, [0, 0, 0, 255]);
    }

    #[test]
    fn decode_rle15_decodes_a_single_run() {
        let mut data = Vec::new();
        for _ in 0..4 {
            data.extend_from_slice(&0xF800u16.to_le_bytes());
        }
        let img = decode_rle15(&data, 2, 2).expect("image");
        assert_eq!(img.get_pixel(0, 0).0, [0xF8, 0, 0, 255]);
        assert_eq!(img.get_pixel(1, 1).0, [0xF8, 0, 0, 255]);
    }

    #[test]
    fn synthetic_header_extracts_one_rgb565_pixel() {
        let mut bytes = vec![0u8; 90];
        bytes[0..4].copy_from_slice(&MAGIC_CTB.to_le_bytes());
        bytes[56..60].copy_from_slice(&72u32.to_le_bytes());
        bytes[72..76].copy_from_slice(&1u32.to_le_bytes());
        bytes[76..80].copy_from_slice(&1u32.to_le_bytes());
        bytes[80..84].copy_from_slice(&88u32.to_le_bytes());
        bytes[84..88].copy_from_slice(&2u32.to_le_bytes());
        // Bit 5 clear means a run of one pixel.
        bytes[88..90].copy_from_slice(&0xF800u16.to_le_bytes());
        let png = extract_preview_png(&bytes).expect("preview png");
        assert!(png.starts_with(&[0x89, b'P', b'N', b'G']));
        let img = image::load_from_memory(&png).unwrap();
        assert_eq!((img.width(), img.height()), (1, 1));
    }

    #[test]
    fn decode_preview_reads_one_rgb565_pixel_and_rejects_a_bad_header() {
        let mut bytes = vec![0u8; 18];
        bytes[0..4].copy_from_slice(&1u32.to_le_bytes());
        bytes[4..8].copy_from_slice(&1u32.to_le_bytes());
        bytes[8..12].copy_from_slice(&16u32.to_le_bytes());
        bytes[12..16].copy_from_slice(&2u32.to_le_bytes());
        bytes[16..18].copy_from_slice(&0xF800u16.to_le_bytes());
        let img = decode_preview(&bytes, 0).unwrap();
        assert_eq!(img.dimensions(), (1, 1));
        assert_eq!(img.get_pixel(0, 0).0, [0xF8, 0, 0, 255]);
        assert!(decode_preview(&bytes, 10).is_none());
        bytes[0..4].copy_from_slice(&0u32.to_le_bytes());
        assert!(decode_preview(&bytes, 0).is_none());
        bytes[0..4].copy_from_slice(&1u32.to_le_bytes());
        bytes[4..8].copy_from_slice(&5000u32.to_le_bytes());
        assert!(decode_preview(&bytes, 0).is_none());
        bytes[4..8].copy_from_slice(&1u32.to_le_bytes());
        bytes[12..16].copy_from_slice(&100u32.to_le_bytes());
        assert!(decode_preview(&bytes, 0).is_none());
    }
}
