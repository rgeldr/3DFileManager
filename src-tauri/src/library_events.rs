use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum LibraryChangeKind {
    Files,
    Folders,
    Tags,
    Settings,
    All,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryChangedPayload {
    pub kind: LibraryChangeKind,
    pub source_window: String,
}

pub fn emit_library_changed(app: &AppHandle, kind: LibraryChangeKind, source_window: &str) {
    let _ = app.emit(
        "library-changed",
        LibraryChangedPayload {
            kind,
            source_window: source_window.to_string(),
        },
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn library_change_kind_serializes_in_camel_case() {
        let json = serde_json::to_value(LibraryChangeKind::All).unwrap();
        assert_eq!(json, "all");
        let payload = LibraryChangedPayload {
            kind: LibraryChangeKind::Settings,
            source_window: "win-2".into(),
        };
        let value = serde_json::to_value(payload).unwrap();
        assert_eq!(value["kind"], "settings");
        assert_eq!(value["sourceWindow"], "win-2");
    }
}
