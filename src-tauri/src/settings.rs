use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

fn default_sidebar_width() -> u32 {
    240
}

fn default_inspector_width() -> u32 {
    320
}

fn default_preview_height() -> u32 {
    240
}

fn default_thumb_retry() -> u32 {
    0
}

fn default_inspector_pinned() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub library_root: Option<String>,
    pub theme: String,
    pub grid_size: String,
    #[serde(default = "default_sidebar_width")]
    pub sidebar_width: u32,
    #[serde(default = "default_inspector_width")]
    pub inspector_width: u32,
    #[serde(default = "default_preview_height")]
    pub preview_height: u32,
    #[serde(default = "default_thumb_retry")]
    pub thumb_retry: u32,
    #[serde(default = "default_inspector_pinned")]
    pub inspector_pinned: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            library_root: None,
            theme: "dark".into(),
            grid_size: "large".into(),
            sidebar_width: default_sidebar_width(),
            inspector_width: default_inspector_width(),
            preview_height: default_preview_height(),
            thumb_retry: default_thumb_retry(),
            inspector_pinned: default_inspector_pinned(),
        }
    }
}

pub fn settings_path(data_dir: &Path) -> std::path::PathBuf {
    data_dir.join("settings.json")
}

pub fn load(data_dir: &Path) -> Settings {
    let path = settings_path(data_dir);
    let Ok(text) = fs::read_to_string(&path) else {
        return Settings::default();
    };
    serde_json::from_str(&text).unwrap_or_default()
}

pub fn check_pane_widths(sidebar_width: u32, inspector_width: u32) -> Result<(), String> {
    if !(180..=640).contains(&sidebar_width) {
        return Err("Sidebar width must be between 180 and 640.".into());
    }
    if !(240..=560).contains(&inspector_width) {
        return Err("Inspector width must be between 240 and 560.".into());
    }
    Ok(())
}

pub fn check_preview_height(preview_height: u32) -> Result<(), String> {
    if !(120..=4000).contains(&preview_height) {
        return Err("Preview height must be between 120 and 4000.".into());
    }
    Ok(())
}

pub fn save(data_dir: &Path, settings: &Settings) -> Result<(), String> {
    fs::create_dir_all(data_dir).map_err(|e| e.to_string())?;
    let text = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(settings_path(data_dir), text).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn load_defaults_missing_pane_widths_and_round_trips() {
        let dir = std::env::temp_dir().join(format!("filelib-settings-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let old = r#"{"libraryRoot":"/tmp/lib","theme":"light","gridSize":"medium"}"#;
        fs::write(settings_path(&dir), old).unwrap();
        let loaded = load(&dir);
        assert_eq!(loaded.library_root.as_deref(), Some("/tmp/lib"));
        assert_eq!(loaded.theme, "light");
        assert_eq!(loaded.grid_size, "medium");
        assert_eq!(loaded.sidebar_width, 240);
        assert_eq!(loaded.inspector_width, 320);
        assert_eq!(loaded.preview_height, 240);
        assert_eq!(loaded.thumb_retry, 0);
        assert!(loaded.inspector_pinned);
        let mut next = loaded;
        next.sidebar_width = 360;
        next.inspector_width = 400;
        next.preview_height = 480;
        next.thumb_retry = 1;
        next.inspector_pinned = false;
        save(&dir, &next).unwrap();
        let again = load(&dir);
        assert_eq!(again.sidebar_width, 360);
        assert_eq!(again.inspector_width, 400);
        assert_eq!(again.preview_height, 480);
        assert_eq!(again.thumb_retry, 1);
        assert!(!again.inspector_pinned);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn pane_widths_reject_values_outside_the_saved_range() {
        assert!(check_pane_widths(180, 240).is_ok());
        assert!(check_pane_widths(640, 560).is_ok());
        assert!(check_pane_widths(179, 320).is_err());
        assert!(check_pane_widths(641, 320).is_err());
        assert!(check_pane_widths(240, 239).is_err());
        assert!(check_pane_widths(240, 561).is_err());
    }

    #[test]
    fn preview_height_rejects_values_outside_the_saved_range() {
        assert!(check_preview_height(120).is_ok());
        assert!(check_preview_height(240).is_ok());
        assert!(check_preview_height(4000).is_ok());
        assert!(check_preview_height(119).is_err());
        assert!(check_preview_height(4001).is_err());
    }
}
