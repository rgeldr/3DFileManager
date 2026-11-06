use std::sync::atomic::{AtomicU32, Ordering};

use tauri::{AppHandle, Manager, WebviewWindow, WebviewWindowBuilder};

pub const SECONDARY_WINDOW_PREFIX: &str = "win-";

static NEXT_WINDOW_INDEX: AtomicU32 = AtomicU32::new(1);

pub fn next_secondary_window_label() -> String {
    let index = NEXT_WINDOW_INDEX.fetch_add(1, Ordering::SeqCst);
    format!("{SECONDARY_WINDOW_PREFIX}{index}")
}

#[derive(Debug, Clone, PartialEq)]
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

/// `WebviewWindowBuilder` takes its label from `WindowConfig`. There is no
/// builder method that replaces it, so the label has to be written first.
pub fn label_window_config(config: &mut tauri::utils::config::WindowConfig, label: &str) {
    config.label = label.to_string();
}

pub(crate) fn origin_from_anchor(
    anchor: Option<(i32, i32)>,
    window_positions: impl IntoIterator<Item = Option<(i32, i32)>>,
) -> (i32, i32) {
    if let Some(pos) = anchor {
        return offset_position(pos);
    }
    for pos in window_positions.into_iter().flatten() {
        return offset_position(pos);
    }
    (120, 120)
}

fn placed_origin(app: &AppHandle, anchor: Option<(i32, i32)>) -> (i32, i32) {
    origin_from_anchor(
        anchor,
        app.webview_windows()
            .values()
            .map(|window| window.outer_position().ok().map(|pos| (pos.x, pos.y))),
    )
}

pub fn open_library_window(
    app: &AppHandle,
    anchor: Option<(i32, i32)>,
) -> Result<WebviewWindow, String> {
    let label = next_secondary_window_label();
    let config = main_window_config_from_tauri_conf();
    let mut window_config = app
        .config()
        .app
        .windows
        .first()
        .cloned()
        .ok_or_else(|| "Missing main window config.".to_string())?;
    label_window_config(&mut window_config, &label);
    let (x, y) = placed_origin(app, anchor);
    // `from_config` applies the webview `dragDropEnabled` flag. The window-level
    // file-drop target is a separate Windows-only builder method, so it has to
    // be set here or a `false` config value is ignored (tao defaults it to true).
    #[cfg_attr(not(windows), allow(unused_mut))]
    let mut window = WebviewWindowBuilder::from_config(app, &window_config)
        .map_err(|err| err.to_string())?
        .title(&config.title)
        .inner_size(config.width, config.height)
        .min_inner_size(config.min_width, config.min_height)
        .position(x as f64, y as f64);
    #[cfg(windows)]
    {
        window = window.drag_and_drop(config.drag_drop_enabled);
    }
    let window = window.build().map_err(|err| err.to_string())?;
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
        let config: MainWindowConfig = main_window_config_from_tauri_conf();
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

    #[test]
    fn origin_uses_the_anchor_then_the_first_window_then_the_default() {
        assert_eq!(origin_from_anchor(Some((10, 20)), [Some((1, 1))]), (42, 52));
        assert_eq!(
            origin_from_anchor(None, [None, Some((3, 4)), Some((9, 9))]),
            (35, 36)
        );
        assert_eq!(origin_from_anchor(None, [None]), (120, 120));
    }

    #[test]
    fn label_window_config_replaces_the_main_label() {
        let mut config: tauri::utils::config::WindowConfig =
            serde_json::from_str(r#"{"label":"main"}"#).unwrap();
        label_window_config(&mut config, "win-3");
        assert_eq!(config.label, "win-3");
    }

    #[test]
    fn windows_file_drop_follows_the_shared_config() {
        let source = include_str!("windows.rs");
        let start = source
            .find("pub fn open_library_window")
            .expect("open_library_window");
        let body = &source[start..];
        assert!(
            body.contains("#[cfg(windows)]")
                && body.contains(".drag_and_drop(config.drag_drop_enabled)"),
            "secondary windows must set the Windows-only drag-and-drop flag from config"
        );
    }
}
