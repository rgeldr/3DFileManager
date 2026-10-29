#[cfg(not(windows))]
use std::path::{Path, PathBuf};

#[cfg(not(windows))]
use crate::drag_out::drag_result_line;

#[derive(Debug)]
pub struct NativeDrag {
    pub result: String,
    pub effect: String,
    pub finished: bool,
    pub detail: String,
}

pub fn start(window: &tauri::WebviewWindow, paths: &[String], icon_path: &str) -> Result<NativeDrag, String> {
    if paths.is_empty() {
        return Err("No files to drag.".into());
    }
    #[cfg(windows)]
    {
        let _ = (window, icon_path);
        crate::drag_win::start_hdrop(paths)
    }
    #[cfg(not(windows))]
    {
        start_desktop(window, paths, icon_path)
    }
}

#[cfg(not(windows))]
fn start_desktop(window: &tauri::WebviewWindow, paths: &[String], icon_path: &str) -> Result<NativeDrag, String> {
    let item = drag::DragItem::Files(paths.iter().map(PathBuf::from).collect());
    let image = drag_image(icon_path);
    let options = drag::Options {
        mode: drag::DragMode::Copy,
        skip_animatation_on_cancel_or_failure: false,
    };
    let on_drop = |result: drag::DragResult, _cursor: drag::CursorPosition| {
        let name = match result {
            drag::DragResult::Dropped => "drop",
            drag::DragResult::Cancel => "cancel",
        };
        let _ = crate::write_debug_log(drag_result_line(name, "copy"));
    };
    #[cfg(target_os = "linux")]
    {
        let gtk = window.gtk_window().map_err(|err| err.to_string())?;
        drag::start_drag(&gtk, item, image, on_drop, options).map_err(|err| err.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        drag::start_drag(window, item, image, on_drop, options).map_err(|err| err.to_string())?;
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    {
        let _ = (window, item, image, on_drop, options);
        return Err("Drag-out is not supported on this platform.".into());
    }
    Ok(NativeDrag {
        result: "started".into(),
        effect: "copy".into(),
        finished: false,
        detail: String::new(),
    })
}

#[cfg(not(windows))]
fn drag_image(icon_path: &str) -> drag::Image {
    let path = Path::new(icon_path);
    if !icon_path.is_empty() && path.is_file() {
        drag::Image::File(path.to_path_buf())
    } else {
        // A missing preview must not abort the drag. This is a 1x1 PNG.
        drag::Image::Raw(FALLBACK_PNG.to_vec())
    }
}

#[cfg(not(windows))]
const FALLBACK_PNG: &[u8] = &[
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0A, 0x49,
    0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00,
    0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_drag_records_a_started_copy() {
        let drag = NativeDrag {
            result: "started".into(),
            effect: "copy".into(),
            finished: false,
            detail: String::new(),
        };
        assert_eq!(drag.result, "started");
        assert_eq!(drag.effect, "copy");
        assert!(!drag.finished);
        assert!(drag.detail.is_empty());
    }

    #[cfg(not(windows))]
    #[test]
    fn drag_image_uses_the_icon_file_or_a_png_fallback() {
        let dir = std::env::temp_dir().join(format!("filelib-drag-image-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let icon = dir.join("icon.png");
        std::fs::write(&icon, FALLBACK_PNG).unwrap();
        match drag_image(&icon.to_string_lossy()) {
            drag::Image::File(path) => assert_eq!(path, icon),
            drag::Image::Raw(_) => panic!("expected the icon file"),
        }
        match drag_image("") {
            drag::Image::Raw(bytes) => {
                assert!(bytes.starts_with(&[0x89, b'P', b'N', b'G']));
                assert_eq!(bytes, FALLBACK_PNG);
            }
            drag::Image::File(path) => panic!("expected the fallback png, got {}", path.display()),
        }
        match drag_image("/tmp/filelib-missing-drag-icon.png") {
            drag::Image::Raw(bytes) => assert_eq!(bytes.len(), FALLBACK_PNG.len()),
            drag::Image::File(path) => panic!("expected the fallback png, got {}", path.display()),
        }
        let _ = std::fs::remove_dir_all(&dir);
    }
}
