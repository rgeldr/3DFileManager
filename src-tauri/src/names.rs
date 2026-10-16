use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupportedType {
    pub id: String,
    pub label: String,
    pub exts: Vec<String>,
}

pub fn supported_types() -> &'static [SupportedType] {
    static TYPES: OnceLock<Vec<SupportedType>> = OnceLock::new();
    TYPES.get_or_init(|| {
        serde_json::from_str(include_str!("../../src/supportedTypes.json"))
            .expect("supportedTypes.json")
    })
}

pub fn is_supported_file(ext: &str) -> bool {
    supported_types()
        .iter()
        .any(|group| group.exts.iter().any(|item| item == ext))
}

pub fn ext_filter_values(exts: &[String]) -> Vec<String> {
    let mut out = Vec::new();
    for ext in exts {
        let ext = ext.trim().to_ascii_lowercase();
        if ext.is_empty() || !is_supported_file(&ext) || out.contains(&ext) {
            continue;
        }
        out.push(ext);
    }
    out
}

const RESERVED: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

pub fn sanitize_component(name: &str) -> String {
    let mut out = String::new();
    for c in name.chars() {
        if c.is_control() || matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') {
            out.push('_');
        } else {
            out.push(c);
        }
    }
    let trimmed = out.trim().trim_end_matches(['.', ' ']);
    let mut s = if trimmed.is_empty() {
        "file".to_string()
    } else {
        trimmed.to_string()
    };
    let stem_upper = s
        .split('.')
        .next()
        .unwrap_or("")
        .to_ascii_uppercase();
    if RESERVED.contains(&stem_upper.as_str()) {
        s = format!("_{s}");
    }
    if s.len() > 180 {
        let mut end = 180;
        while !s.is_char_boundary(end) {
            end -= 1;
        }
        s.truncate(end);
    }
    s
}

pub fn default_sort_name(file_name: &str) -> String {
    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(file_name);
    stem.replace('_', " ").trim().to_string()
}

pub fn extension_of(file_name: &str) -> String {
    Path::new(file_name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
}

pub fn unique_file_path(dir: &Path, file_name: &str) -> PathBuf {
    let safe = sanitize_component(file_name);
    let candidate = dir.join(&safe);
    if !candidate.exists() {
        return candidate;
    }
    let path = Path::new(&safe);
    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| safe.clone());
    let ext = path.extension().map(|e| e.to_string_lossy().to_string());
    for n in 2..10_000 {
        let name = match &ext {
            Some(e) if !e.is_empty() => format!("{stem} ({n}).{e}"),
            _ => format!("{stem} ({n})"),
        };
        let next = dir.join(name);
        if !next.exists() {
            return next;
        }
    }
    dir.join(format!("{safe}-copy"))
}

pub fn unique_dir_name(parent: &Path, name: &str) -> String {
    let safe = sanitize_component(name);
    if !parent.join(&safe).exists() {
        return safe;
    }
    for n in 2..10_000 {
        let candidate = format!("{safe} ({n})");
        if !parent.join(&candidate).exists() {
            return candidate;
        }
    }
    format!("{safe}-copy")
}

pub fn is_archive(ext: &str) -> bool {
    matches!(ext, "zip" | "rar" | "7z")
}

pub fn is_mesh(ext: &str) -> bool {
    matches!(ext, "stl" | "obj" | "3mf")
}

pub const THUMBNAIL_EXTS: &[&str] = &[
    "png",
    "jpg",
    "jpeg",
    "stl",
    "obj",
    "3mf",
    "ctb",
    "gcode",
    "bgcode",
    "lys",
    "chitubox",
    "ags",
    "f3d",
];

pub fn queues_thumbnail(ext: &str) -> bool {
    THUMBNAIL_EXTS.contains(&ext)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replaces_illegal_chars_and_reserved_names() {
        assert_eq!(sanitize_component("a:b*c"), "a_b_c");
        assert_eq!(sanitize_component("CON"), "_CON");
        assert_eq!(sanitize_component("  name.  "), "name");
    }

    #[test]
    fn sort_name_replaces_underscores() {
        assert_eq!(default_sort_name("Throne_of_Baal.stl"), "Throne of Baal");
    }

    #[test]
    fn pdf_is_a_supported_file_and_not_a_mesh_or_archive() {
        assert_eq!(extension_of("Assembly Guide.PDF"), "pdf");
        assert!(is_supported_file("pdf"));
        assert!(is_supported_file(&extension_of("instructions.PDF")));
        assert!(!is_mesh("pdf"));
        assert!(!is_archive("pdf"));
    }

    #[test]
    fn txt_is_a_supported_file_and_not_a_mesh_or_archive() {
        assert_eq!(extension_of("Read Me.TXT"), "txt");
        assert!(is_supported_file("txt"));
        assert!(is_supported_file(&extension_of("Read Me.TXT")));
        assert!(!is_mesh("txt"));
        assert!(!is_archive("txt"));
    }

    #[test]
    fn supported_types_match_import_classification() {
        let groups = supported_types();
        let jpg = groups.iter().find(|group| group.id == "jpg").unwrap();
        assert_eq!(jpg.exts, vec!["jpg".to_string(), "jpeg".to_string()]);
        assert!(groups.iter().filter(|group| group.exts.iter().any(|ext| ext == "jpg")).count() == 1);
        assert!(groups.iter().all(|group| group.exts.iter().all(|ext| is_supported_file(ext))));
        assert!(!is_supported_file("lychee"));
        assert!(!is_supported_file("zip"));
        assert!(!is_supported_file("exe"));
        let mut flat = Vec::new();
        for group in groups {
            for ext in &group.exts {
                assert!(!flat.contains(ext), "duplicate ext {ext}");
                flat.push(ext.clone());
            }
        }
        for ext in [
            "stl", "3mf", "obj", "gcode", "bgcode", "ctb", "chitubox", "ags", "lys", "png", "jpg",
            "jpeg", "pdf", "txt", "step", "stp", "f3d", "md", "scad",
        ] {
            assert!(flat.iter().any(|item| item == ext), "missing {ext}");
        }
        assert_eq!(ext_filter_values(&["JPG".into(), "jpg".into(), "exe".into(), "jpeg".into()]), vec!["jpg".to_string(), "jpeg".to_string()]);
    }

    #[test]
    fn cad_and_doc_extensions_are_supported_not_mesh_or_archive() {
        for (ext, sample) in [
            ("step", "part.STEP"),
            ("stp", "part.STP"),
            ("f3d", "design.F3D"),
            ("md", "notes.MD"),
            ("scad", "widget.SCAD"),
        ] {
            assert_eq!(extension_of(sample), ext);
            assert!(is_supported_file(ext));
            assert!(is_supported_file(&extension_of(sample)));
            assert!(!is_mesh(ext));
            assert!(!is_archive(ext));
        }
    }
}
