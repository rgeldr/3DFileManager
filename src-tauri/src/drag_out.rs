use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use serde::{Deserialize, Serialize};

use crate::names::sanitize_component;

const MAX_LEGACY: usize = 259;
const STAGE_MAX_AGE_SECS: u64 = 24 * 60 * 60;

// Drag-out hands slicers a wide CF_HDROP of real paths (see drag_win). A stored
// `Hero.STL` or an extensionless name is staged as a hard link named `Hero.stl`
// so the path in that drop ends with the catalog extension. Paths that already
// have that name are dragged in place.

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

/// One library file the webview wants to drag out.
///
/// `file_name` is the original name (for example `Hero.STL`). The drag path
/// uses that stem plus the catalog extension in lowercase (`Hero.stl`).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DragSource {
    pub path: String,
    pub file_name: String,
    pub ext: String,
}

pub fn prepare_drag_paths(sources: &[DragSource], icon_path: &str) -> PreparedDrag {
    cleanup_staged();
    let mut out_paths = Vec::new();
    let mut skipped = Vec::new();
    let mut reports = Vec::new();
    for source in sources {
        match prepare_one(source) {
            Ok((drag_path, report)) => {
                out_paths.push(drag_path);
                reports.push(report);
            }
            Err(report) => {
                skipped.push(display_name(&source.path));
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

/// Name ChiTuBox and other drop targets will see. The extension is the catalog
/// extension in lowercase, so `Hero.STL` is dragged as `Hero.stl`.
pub fn drag_file_name(file_name: &str, ext: &str) -> String {
    let ext = ext.trim().trim_start_matches('.').to_ascii_lowercase();
    let raw = if file_name.trim().is_empty() { "file" } else { file_name };
    let safe = sanitize_component(raw);
    let safe = if safe.is_empty() { "file".to_string() } else { safe };
    if ext.is_empty() {
        return safe;
    }
    let stem = Path::new(&safe)
        .file_stem()
        .map(|item| item.to_string_lossy().to_string())
        .filter(|stem| !stem.is_empty())
        .unwrap_or_else(|| "file".into());
    format!("{stem}.{ext}")
}

pub fn drag_log_line(paths: &[String]) -> String {
    if paths.is_empty() {
        "drag-paths (none)".to_string()
    } else {
        format!("drag-paths {}", paths.join(" | "))
    }
}

pub fn drag_start_line(paths: &[String], icon: &str) -> String {
    let listed = if paths.is_empty() {
        "(none)".to_string()
    } else {
        paths.join(" | ")
    };
    let icon = if icon.is_empty() { "missing" } else { icon };
    format!("drag-start count={} icon={icon} paths={listed}", paths.len())
}

pub fn drag_result_line(result: &str, effect: &str) -> String {
    format!("drag-result result={result} effect={effect}")
}

/// Wide `CF_HDROP` / `DROPFILES` payload. Header is 20 bytes, `fWide = 1`,
/// then UTF-16LE paths each terminated by NUL, then an extra NUL.
#[cfg(any(windows, test))]
pub fn hdrop_bytes(paths: &[String]) -> Vec<u8> {
    let mut units = Vec::<u16>::new();
    for path in paths {
        units.extend(path.encode_utf16());
        units.push(0);
    }
    units.push(0);
    let mut bytes = Vec::with_capacity(20 + units.len() * 2);
    bytes.extend_from_slice(&20u32.to_le_bytes());
    bytes.extend_from_slice(&0i32.to_le_bytes());
    bytes.extend_from_slice(&0i32.to_le_bytes());
    bytes.extend_from_slice(&0i32.to_le_bytes());
    bytes.extend_from_slice(&1i32.to_le_bytes());
    for unit in units {
        bytes.extend_from_slice(&unit.to_le_bytes());
    }
    bytes
}

#[cfg(test)]
pub fn hdrop_paths(bytes: &[u8]) -> Result<Vec<String>, String> {
    if bytes.len() < 20 {
        return Err("CF_HDROP is shorter than DROPFILES.".into());
    }
    let pfiles = u32::from_le_bytes(bytes[0..4].try_into().unwrap()) as usize;
    let wide = i32::from_le_bytes(bytes[16..20].try_into().unwrap());
    if wide == 0 {
        return Err("CF_HDROP is not wide.".into());
    }
    if pfiles > bytes.len() || (bytes.len() - pfiles) % 2 != 0 {
        return Err("CF_HDROP wide paths are misaligned.".into());
    }
    let mut units = Vec::with_capacity((bytes.len() - pfiles) / 2);
    for chunk in bytes[pfiles..].chunks_exact(2) {
        units.push(u16::from_le_bytes([chunk[0], chunk[1]]));
    }
    let mut paths = Vec::new();
    let mut start = 0;
    while start < units.len() {
        if units[start] == 0 {
            break;
        }
        let Some(rel) = units[start..].iter().position(|unit| *unit == 0) else {
            return Err("CF_HDROP path is missing a terminator.".into());
        };
        let end = start + rel;
        let path = String::from_utf16(&units[start..end]).map_err(|err| err.to_string())?;
        paths.push(path);
        start = end + 1;
    }
    Ok(paths)
}

fn stored_file_name(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_default()
}

fn prepare_one(source: &DragSource) -> Result<(String, DragReport), DragReport> {
    let original = source.path.as_str();
    let path = PathBuf::from(original);
    if !path.is_file() {
        return Err(report(original, original, false, String::new(), Some("File is missing.".into())));
    }
    let simplified_path = dunce::canonicalize(&path).unwrap_or_else(|_| path.clone());
    let simplified = simplified_path.to_string_lossy().to_string();
    let label = if source.file_name.trim().is_empty() {
        stored_file_name(&simplified)
    } else {
        source.file_name.clone()
    };
    let desired = drag_file_name(&label, &source.ext);
    let name_matches = stored_file_name(&simplified) == desired;
    if name_matches && !path_needs_staging(&simplified) {
        return Ok((
            simplified.clone(),
            report(original, &simplified, false, simplified.clone(), None),
        ));
    }
    let dir = stage_dir();
    if let Err(err) = fs::create_dir_all(&dir) {
        return Err(report(original, &simplified, false, String::new(), Some(err.to_string())));
    }
    let dest = match staged_destination(&dir, &desired) {
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
        assert!(!path_needs_staging(r"C:\Library\model.stl"));
    }

    fn source(path: &Path, file_name: &str, ext: &str) -> DragSource {
        DragSource {
            path: path.to_string_lossy().to_string(),
            file_name: file_name.to_string(),
            ext: ext.to_string(),
        }
    }

    #[test]
    fn short_path_is_not_staged_and_missing_file_is_skipped() {
        let dir = std::env::temp_dir().join(format!("filelib-drag-short-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let src = dir.join("model.stl");
        fs::write(&src, b"solid").unwrap();
        let prepared = prepare_drag_paths(&[source(&src, "model.stl", "stl")], "/missing/drag.png");
        assert_eq!(prepared.paths.len(), 1);
        assert!(prepared.skipped.is_empty());
        assert!(!prepared.reports[0].staged);
        assert!(prepared.paths[0].ends_with("model.stl"));
        assert!(src.is_file());
        let missing = prepare_drag_paths(
            &[DragSource {
                path: "/tmp/filelib-does-not-exist.stl".into(),
                file_name: "filelib-does-not-exist.stl".into(),
                ext: "stl".into(),
            }],
            "",
        );
        assert!(missing.paths.is_empty());
        assert_eq!(missing.skipped, vec!["filelib-does-not-exist.stl".to_string()]);
        assert_eq!(missing.reports[0].error.as_deref(), Some("File is missing."));
        assert_eq!(drag_log_line(&missing.paths), "drag-paths (none)");
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
        let prepared = prepare_drag_paths(&[source(&src, "guild model.stl", "stl")], "");
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

    #[test]
    fn drag_file_name_uses_the_lowercase_catalog_extension() {
        assert_eq!(drag_file_name("Hero.STL", "stl"), "Hero.stl");
        assert_eq!(drag_file_name("Hero.STL", "STL"), "Hero.stl");
        assert_eq!(drag_file_name("hashname", "stl"), "hashname.stl");
        assert_eq!(drag_file_name("Read Me.TXT", "txt"), "Read Me.txt");
        assert_eq!(drag_file_name("a:b.stl", "stl"), "a_b.stl");
        assert_eq!(drag_log_line(&["C:\\drag\\Hero.stl".into()]), "drag-paths C:\\drag\\Hero.stl");
        assert_eq!(
            drag_start_line(&[r"C:\drag\Hero.stl".into(), r"C:\drag\Base.stl".into()], ""),
            "drag-start count=2 icon=missing paths=C:\\drag\\Hero.stl | C:\\drag\\Base.stl"
        );
        assert_eq!(drag_result_line("drop", "copy"), "drag-result result=drop effect=copy");
    }

    #[test]
    fn hdrop_lists_every_real_path_with_its_extension() {
        let paths = vec![
            r"C:\Library\Hero.stl".to_string(),
            r"C:\Library\Base Mini.obj".to_string(),
        ];
        let bytes = hdrop_bytes(&paths);
        assert_eq!(u32::from_le_bytes(bytes[0..4].try_into().unwrap()), 20);
        assert_eq!(i32::from_le_bytes(bytes[16..20].try_into().unwrap()), 1);
        assert_eq!(hdrop_paths(&bytes).unwrap(), paths);
        assert!(bytes.len() % 2 == 0);
        assert_eq!(hdrop_paths(&hdrop_bytes(&[])).unwrap(), Vec::<String>::new());
    }

    #[test]
    fn uppercase_and_extensionless_files_are_staged_under_the_original_name() {
        let dir = std::env::temp_dir().join(format!("filelib-drag-alias-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let upper = dir.join("Hero.STL");
        let bare = dir.join("abc123");
        fs::write(&upper, b"solid upper").unwrap();
        fs::write(&bare, b"solid bare").unwrap();
        let prepared = prepare_drag_paths(
            &[
                source(&upper, "Hero.STL", "stl"),
                source(&bare, "Base Mini.stl", "stl"),
            ],
            "",
        );
        assert_eq!(prepared.skipped, Vec::<String>::new(), "{:?}", prepared.reports);
        assert_eq!(prepared.paths.len(), 2);
        assert!(prepared.reports.iter().all(|report| report.staged));
        assert!(prepared.paths[0].ends_with("Hero.stl"), "{}", prepared.paths[0]);
        assert!(prepared.paths[1].ends_with("Base Mini.stl"), "{}", prepared.paths[1]);
        assert!(prepared.paths[0].contains("3D File Library"));
        assert_eq!(fs::read(&prepared.paths[0]).unwrap(), b"solid upper");
        assert_eq!(fs::read(&prepared.paths[1]).unwrap(), b"solid bare");
        assert_eq!(fs::read(&upper).unwrap(), b"solid upper");
        assert!(drag_log_line(&prepared.paths).contains("Hero.stl"));
        for path in &prepared.paths {
            let _ = fs::remove_file(path);
        }
        let _ = fs::remove_dir_all(&dir);
    }
}
