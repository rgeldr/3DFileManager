use std::sync::atomic::{AtomicU32, Ordering};

use tauri::{AppHandle, Manager, PhysicalPosition, WebviewWindow, WebviewWindowBuilder};

pub const MAIN_WINDOW_LABEL: &str = "main";
pub const SECONDARY_WINDOW_PREFIX: &str = "win-";

static NEXT_WINDOW_INDEX: AtomicU32 = AtomicU32::new(1);

pub fn next_secondary_window_label() -> String {
    let index = NEXT_WINDOW_INDEX.fetch_add(1, Ordering::SeqCst);
    format!("{SECONDARY_WINDOW_PREFIX}{index}")
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MainWindowConfig {
    pub title: String,
    pub width: f64,
    pub height: f64,
    pub min_width: f64,
    pub min_height: f64,
    pub drag_drop_enabled: bool,
}

pub fn main_window_config_from_tauri_conf() -> MainWindowConfig {
    MainWindowConfig {
        title: "3D File Library".into(),
        width: 1280.0,
        height: 800.0,
        min_width: 960.0,
        min_height: 640.0,
        drag_drop_enabled: true,
    }
}

pub fn offset_position(base: (i32, i32)) -> (i32, i32) {
    (base.0 + 32, base.1 + 32)
}

pub fn open_library_window(
    app: &AppHandle,
    anchor: Option<(i32, i32)>,
) -> Result<WebviewWindow, String> {
    let label = next_secondary_window_label();
    let config = main_window_config_from_tauri_conf();
    let window_config = app
        .config()
        .app
        .windows
        .first()
        .cloned()
        .ok_or_else(|| "Missing main window config.".to_string())?;
    let (x, y) = match anchor {
        Some(pos) => offset_position(pos),
        None => (100, 100),
    };
    let window = WebviewWindowBuilder::from_config(app, &window_config)
        .map_err(|err| err.to_string())?
        .label(&label)
        .title(&config.title)
        .inner_size(config.width, config.height)
        .min_inner_size(config.min_width, config.min_height)
        .drag_and_drop(config.drag_drop_enabled)
        .position(x as f64, y as f64)
        .build()
        .map_err(|err| err.to_string())?;
    window.set_focus().map_err(|err| err.to_string())?;
    Ok(window)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secondary_labels_increment_and_stay_unique() {
        let first = next_secondary_window_label();
        let second = next_secondary_window_label();
        assert_ne!(first, second);
        assert!(first.starts_with(SECONDARY_WINDOW_PREFIX));
        assert!(second.starts_with(SECONDARY_WINDOW_PREFIX));
    }

    #[test]
    fn main_window_config_matches_tauri_conf_defaults() {
        let config = main_window_config_from_tauri_conf();
        assert_eq!(config.title, "3D File Library");
        assert_eq!(config.width, 1280.0);
        assert_eq!(config.height, 800.0);
        assert_eq!(config.min_width, 960.0);
        assert_eq!(config.min_height, 640.0);
        assert!(config.drag_drop_enabled);
    }

    #[test]
    fn offset_position_shifts_slightly() {
        assert_eq!(offset_position((10, 20)), (42, 52));
    }
}
