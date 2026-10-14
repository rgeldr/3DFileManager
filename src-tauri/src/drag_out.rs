use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use serde::Serialize;

use crate::names::sanitize_component;

const MAX_LEGACY: usize = 259;
const STAGE_MAX_AGE_SECS: u64 = 24 * 60 * 60;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DragReport {
    pub original: String,
    pub simplified: String,
    pub length: usize,
    pub extended_prefix: bool,
    pub has_forward_slash: bool,
    pub exists: bool,
    pub staged: bool,
    pub drag_path: String,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedDrag {
    pub paths: Vec<String>,
    pub skipped: Vec<String>,
    pub reports: Vec<DragReport>,
    pub icon_bytes: u64,
}

pub fn path_needs_staging(path: &str) -> bool {
    if path.starts_with(r"\\?\") || path.chars().count() > MAX_LEGACY {
        return true;
    }
    #[cfg(windows)]
    if path.contains('/') {
        return true;
    }
    false
}

pub fn prepare_drag_paths(paths: &[String], icon_path: &str) -> PreparedDrag {
    cleanup_staged();
    let mut out_paths = Vec::new();
    let mut skipped = Vec::new();
    let mut reports = Vec::new();
    for original in paths {
        match prepare_one(original) {
            Ok((drag_path, report)) => {
                out_paths.push(drag_path);
                reports.push(report);
            }
            Err(report) => {
                skipped.push(display_name(original));
                reports.push(report);
            }
        }
    }
    let icon_bytes = fs::metadata(icon_path).map(|meta| meta.len()).unwrap_or(0);
    PreparedDrag {
        paths: out_paths,
        skipped,
        reports,
        icon_bytes,
    }
}

fn prepare_one(original: &str) -> Result<(String, DragReport), DragReport> {
    let path = PathBuf::from(original);
    if !path.is_file() {
        return Err(report(original, original, false, String::new(), Some("File is missing.".into())));
    }
    let simplified_path = dunce::canonicalize(&path).unwrap_or_else(|_| path.clone());
    let simplified = simplified_path.to_string_lossy().to_string();
    if !path_needs_staging(&simplified) {
        return Ok((
            simplified.clone(),
            report(original, &simplified, false, simplified.clone(), None),
        ));
    }
    let dir = stage_dir();
    if let Err(err) = fs::create_dir_all(&dir) {
        return Err(report(original, &simplified, false, String::new(), Some(err.to_string())));
    }
    let file_name = path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".into());
    let dest = match staged_destination(&dir, &file_name) {
        Ok(dest) => dest,
        Err(err) => return Err(report(original, &simplified, false, String::new(), Some(err))),
    };
    if let Err(err) = link_or_copy(&path, &dest) {
        return Err(report(original, &simplified, false, String::new(), Some(err)));
    }
    let drag = dest.to_string_lossy().to_string();
    if path_needs_staging(&drag) {
        let _ = fs::remove_file(&dest);
        return Err(report(
            original,
            &simplified,
            false,
            String::new(),
            Some("Staged path is still too long.".into()),
        ));
    }
    Ok((drag.clone(), report(original, &simplified, true, drag, None)))
}

fn staged_destination(dir: &Path, original_name: &str) -> Result<PathBuf, String> {
    if dir.to_string_lossy().chars().count() + 2 > MAX_LEGACY {
        return Err("The staging folder path is too long.".into());
    }
    let safe = sanitize_component(original_name);
    let ext = Path::new(&safe)
        .extension()
        .map(|item| item.to_string_lossy().to_string())
        .unwrap_or_default();
    for n in 0..1_000 {
        let name = if n == 0 {
            shrink_name(dir, &safe)
        } else {
            numbered_name(dir, &safe, &ext, n)
        };
        let dest = dir.join(&name);
        if dest.to_string_lossy().chars().count() > MAX_LEGACY {
            return short_drag_name(dir, &ext);
        }
        if !dest.exists() {
            return Ok(dest);
        }
    }
    short_drag_name(dir, &ext)
}

fn shrink_name(dir: &Path, safe: &str) -> String {
    if dir.join(safe).to_string_lossy().chars().count() <= MAX_LEGACY {
        return safe.to_string();
    }
    let budget = MAX_LEGACY.saturating_sub(dir.to_string_lossy().chars().count() + 1);
    truncate_component(safe, budget.max(1))
}

fn numbered_name(dir: &Path, safe: &str, ext: &str, n: u32) -> String {
    let suffix = format!(" ({n})");
    let stem = Path::new(safe)
        .file_stem()
        .map(|item| item.to_string_lossy().to_string())
        .unwrap_or_else(|| safe.to_string());
    let ext_part = if ext.is_empty() { String::new() } else { format!(".{ext}") };
    let budget = MAX_LEGACY.saturating_sub(dir.to_string_lossy().chars().count() + 1);
    let stem_budget = budget.saturating_sub(suffix.chars().count() + ext_part.chars().count()).max(1);
    format!("{}{suffix}{ext_part}", truncate_chars(&stem, stem_budget))
}

fn truncate_component(name: &str, budget: usize) -> String {
    let path = Path::new(name);
    let ext = path.extension().and_then(|item| item.to_str()).unwrap_or("");
    if ext.is_empty() || ext.chars().count() + 2 > budget {
        return truncate_chars(name, budget);
    }
    let stem = path.file_stem().and_then(|item| item.to_str()).unwrap_or("file");
    let stem_budget = budget - ext.chars().count() - 1;
    format!("{}.{}", truncate_chars(stem, stem_budget.max(1)), ext)
}

fn truncate_chars(value: &str, max: usize) -> String {
    value.chars().take(max).collect()
}

fn short_drag_name(dir: &Path, ext: &str) -> Result<PathBuf, String> {
    let ext_part = if ext.is_empty() { String::new() } else { format!(".{ext}") };
    for n in 1..10_000 {
        let name = format!("drag-{n}{ext_part}");
        let dest = dir.join(&name);
        if dest.to_string_lossy().chars().count() > MAX_LEGACY {
            return Err("The staging folder path is too long.".into());
        }
        if !dest.exists() {
            return Ok(dest);
        }
    }
    Err("Could not pick a staging name.".into())
}

fn link_or_copy(src: &Path, dest: &Path) -> Result<(), String> {
    fs::hard_link(src, dest).or_else(|_| fs::copy(src, dest).map(|_| ())).map_err(|err| err.to_string())
}

pub fn stage_dir() -> PathBuf {
    std::env::temp_dir().join("3D File Library").join("drag")
}

pub fn cleanup_staged() {
    let Ok(entries) = fs::read_dir(stage_dir()) else {
        return;
    };
    let now = SystemTime::now();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Ok(modified) = entry.metadata().and_then(|meta| meta.modified()) else {
            continue;
        };
        let old = now
            .duration_since(modified)
            .map(|age| age.as_secs() > STAGE_MAX_AGE_SECS)
            .unwrap_or(false);
        if old {
            let _ = fs::remove_file(path);
        }
    }
}

fn display_name(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string())
}

fn report(original: &str, simplified: &str, staged: bool, drag_path: String, error: Option<String>) -> DragReport {
    DragReport {
        original: original.to_string(),
        simplified: simplified.to_string(),
        length: simplified.chars().count(),
        extended_prefix: simplified.starts_with(r"\\?\"),
        has_forward_slash: simplified.contains('/'),
        exists: Path::new(original).is_file(),
        staged,
        drag_path,
        error,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extended_and_overlong_paths_need_staging() {
        assert!(path_needs_staging(r"\\?\C:\Library\model.stl"));
        let long = format!("C:\\{}\\model.stl", "n".repeat(260));
        assert!(long.chars().count() > MAX_LEGACY);
        assert!(path_needs_staging(&long));
        assert!(!path_needs_staging("/tmp/model.stl"));
    }

    #[test]
    fn short_path_is_not_staged_and_missing_file_is_skipped() {
        let dir = std::env::temp_dir().join(format!("filelib-drag-short-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let src = dir.join("model.stl");
        fs::write(&src, b"solid").unwrap();
        let prepared = prepare_drag_paths(&[src.to_string_lossy().to_string()], "/missing/drag.png");
        assert_eq!(prepared.paths.len(), 1);
        assert!(prepared.skipped.is_empty());
        assert!(!prepared.reports[0].staged);
        assert!(src.is_file());
        let missing = prepare_drag_paths(&["/tmp/filelib-does-not-exist.stl".into()], "");
        assert!(missing.paths.is_empty());
        assert_eq!(missing.skipped, vec!["filelib-does-not-exist.stl".to_string()]);
        assert_eq!(missing.reports[0].error.as_deref(), Some("File is missing."));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn long_path_is_staged_without_deleting_the_source() {
        let base = std::env::temp_dir().join(format!("filelib-drag-long-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        let mut dir = base.clone();
        while dir.join("guild model.stl").to_string_lossy().chars().count() <= MAX_LEGACY {
            dir.push("nestedname");
        }
        fs::create_dir_all(&dir).unwrap();
        let src = dir.join("guild model.stl");
        fs::write(&src, b"solid long").unwrap();
        let original = src.to_string_lossy().to_string();
        assert!(path_needs_staging(&original), "path len {}", original.chars().count());
        let prepared = prepare_drag_paths(&[original], "");
        assert_eq!(prepared.skipped, Vec::<String>::new(), "{:?}", prepared.reports);
        assert_eq!(prepared.paths.len(), 1);
        let drag = &prepared.paths[0];
        assert!(prepared.reports[0].staged);
        assert!(Path::new(drag).is_file());
        assert!(drag.chars().count() <= MAX_LEGACY);
        assert!(src.is_file());
        assert_ne!(drag, &src.to_string_lossy().to_string());
        assert_eq!(fs::read(drag).unwrap(), b"solid long");
        let _ = fs::remove_file(drag);
        let _ = fs::remove_dir_all(&base);
    }
}
