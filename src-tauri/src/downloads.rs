use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use walkdir::WalkDir;

use crate::db::AppDb;
use crate::names::{extension_of, is_archive, is_supported_file};
use crate::settings::Settings;

const PRODUCTION_MAX_DEPTH: usize = 8;
const PRODUCTION_MAX_FILES: usize = 5000;
const PRODUCTION_MAX_DIRS: usize = 2000;

#[derive(Debug, Clone, Copy)]
struct WalkCaps {
    max_depth: usize,
    max_files: usize,
    max_dirs: usize,
}

impl WalkCaps {
    fn production() -> Self {
        Self {
            max_depth: PRODUCTION_MAX_DEPTH,
            max_files: PRODUCTION_MAX_FILES,
            max_dirs: PRODUCTION_MAX_DIRS,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadRow {
    pub name: String,
    pub relative_dir: String,
    pub ext: String,
    pub size_bytes: u64,
    pub mtime: i64,
    pub absolute_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum ListDownloadsResult {
    Unset,
    Missing,
    Ok {
        rows: Vec<DownloadRow>,
        truncated: bool,
    },
}

/// `\\?\` and `\\?\UNC\` forms from `Path::canonicalize` on Windows.
fn strip_verbatim_str(path: &str) -> String {
    let rest = path.strip_prefix(r"\\?\").unwrap_or(path);
    if let Some(unc) = rest.strip_prefix(r"UNC\") {
        return format!(r"\\{unc}");
    }
    if let Some(unc) = rest.strip_prefix("UNC/") {
        return format!("//{unc}");
    }
    rest.to_string()
}

/// Windows containment is case-insensitive and ignores the verbatim prefix.
/// A sibling such as `Downloads2` is not inside `Downloads`.
fn contained_os(path: &str, root: &str, windows: bool) -> bool {
    let path = strip_verbatim_str(path);
    let root = strip_verbatim_str(root);
    if windows {
        let path = path.replace('/', "\\").trim_end_matches('\\').to_lowercase();
        let root = root.replace('/', "\\").trim_end_matches('\\').to_lowercase();
        path == root || path.starts_with(&(root + "\\"))
    } else {
        Path::new(&path).starts_with(Path::new(&root))
    }
}

fn path_contained(path: &Path, root: &Path) -> bool {
    contained_os(&path.to_string_lossy(), &root.to_string_lossy(), cfg!(windows))
}

fn display_path_os(path: &str, windows: bool) -> String {
    let stripped = strip_verbatim_str(path);
    if windows {
        stripped.replace('/', "\\")
    } else {
        stripped.replace('\\', "/")
    }
}

fn display_path(path: &Path) -> String {
    display_path_os(&path.to_string_lossy(), cfg!(windows))
}

fn with_native_separators(rel: &str, windows: bool) -> String {
    if windows {
        rel.replace('/', "\\")
    } else {
        rel.replace('\\', "/")
    }
}

fn skip_incomplete_download(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.ends_with(".crdownload") || lower.ends_with(".part") || lower.ends_with(".tmp")
}

fn compatible_file(ext: &str) -> bool {
    is_supported_file(ext) || is_archive(ext)
}

/// Directory junctions are reparse points that Rust does not report as symlinks.
/// `follow_links(false)` therefore still walks them unless we skip them first.
fn junction_from_reparse(is_reparse_point: bool, is_symlink: bool) -> bool {
    is_reparse_point && !is_symlink
}

/// `FILE_ATTRIBUTE_REPARSE_POINT`. Parentheses matter: `!=` binds tighter than `&`.
fn has_reparse_point(attributes: u32) -> bool {
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
    (attributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0
}

fn is_junction(path: &Path) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        let Ok(meta) = fs::symlink_metadata(path) else {
            return false;
        };
        return junction_from_reparse(
            has_reparse_point(meta.file_attributes()),
            meta.file_type().is_symlink(),
        );
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        false
    }
}

fn is_directory_symlink(path: &Path) -> bool {
    let Ok(meta) = fs::symlink_metadata(path) else {
        return false;
    };
    if !meta.file_type().is_symlink() {
        return false;
    }
    fs::metadata(path).map(|m| m.is_dir()).unwrap_or(false)
}

fn should_descend(path: &Path, depth: usize) -> bool {
    if depth == 0 {
        return true;
    }
    !is_directory_symlink(path) && !is_junction(path)
}

fn relative_dir_display(root: &Path, file: &Path) -> String {
    let Some(parent) = file.parent() else {
        return String::new();
    };
    let Ok(rel) = parent.strip_prefix(root) else {
        return String::new();
    };
    if rel.as_os_str().is_empty() {
        return String::new();
    }
    with_native_separators(&rel.to_string_lossy().replace('\\', "/"), cfg!(windows))
}

pub fn validate_downloads_folder(db: &AppDb, path: Option<&Path>) -> Result<Option<PathBuf>, String> {
    let Some(path) = path else {
        return Ok(None);
    };
    if !path.exists() {
        return Err("That path does not exist.".into());
    }
    if !path.is_dir() {
        return Err("Pick a folder, not a file.".into());
    }
    let canonical = path.canonicalize().map_err(|e| e.to_string())?;
    if let Ok(library) = db.library_root() {
        if let Ok(library) = library.canonicalize() {
            if path_contained(&canonical, &library) {
                return Err("The Downloads folder cannot be inside the library.".into());
            }
        }
    }
    Ok(Some(canonical))
}

pub fn set_downloads_folder(db: &AppDb, path: Option<String>) -> Result<Settings, String> {
    let validated = match path {
        None => None,
        Some(text) => validate_downloads_folder(db, Some(Path::new(&text)))?,
    };
    let mut settings = db.settings();
    settings.downloads_folder = validated.as_ref().map(|p| display_path(p));
    db.save_settings(&settings)?;
    Ok(settings)
}

/// Lists the saved folder only. There is no directory argument to supply.
pub fn list_downloads(db: &AppDb) -> Result<ListDownloadsResult, String> {
    let settings = db.settings();
    let Some(saved) = settings.downloads_folder.as_deref() else {
        return Ok(ListDownloadsResult::Unset);
    };
    let root = PathBuf::from(saved);
    if !root.is_dir() {
        return Ok(ListDownloadsResult::Missing);
    }
    let Ok(canonical_root) = root.canonicalize() else {
        return Ok(ListDownloadsResult::Missing);
    };
    Ok(list_downloads_walk(&canonical_root, WalkCaps::production()))
}

pub fn allowed_reveal_target(downloads_root: &Path, candidate: &Path) -> Result<PathBuf, String> {
    let root = downloads_root
        .canonicalize()
        .map_err(|_| "The Downloads folder is missing.".to_string())?;
    let canonical = candidate.canonicalize().map_err(|_| "That file is not in Downloads.".to_string())?;
    if !path_contained(&canonical, &root) {
        return Err("That file is outside the Downloads folder.".into());
    }
    Ok(PathBuf::from(display_path(&canonical)))
}

fn list_downloads_walk(root: &Path, caps: WalkCaps) -> ListDownloadsResult {
    let mut rows = Vec::new();
    let mut seen = HashSet::new();
    let mut dirs_entered = 0usize;
    let mut truncated = false;

    for entry in WalkDir::new(root)
        .max_depth(caps.max_depth)
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| should_descend(entry.path(), entry.depth()))
        .filter_map(|entry| entry.ok())
    {
        if entry.file_type().is_dir() {
            dirs_entered += 1;
            if dirs_entered > caps.max_dirs {
                truncated = true;
                break;
            }
            continue;
        }
        let path = entry.path();
        let Some(entry_name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if skip_incomplete_download(entry_name) {
            continue;
        }
        let meta = match fs::metadata(path) {
            Ok(meta) if meta.is_file() => meta,
            _ => continue,
        };
        let Ok(canonical) = path.canonicalize() else {
            continue;
        };
        if !path_contained(&canonical, root) {
            continue;
        }
        let Some(name) = canonical.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if skip_incomplete_download(name) {
            continue;
        }
        let ext = extension_of(name);
        if !compatible_file(&ext) {
            continue;
        }
        if !seen.insert(canonical.clone()) {
            continue;
        }
        let mtime = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        rows.push(DownloadRow {
            name: name.to_string(),
            relative_dir: relative_dir_display(root, &canonical),
            ext,
            size_bytes: meta.len(),
            mtime,
            absolute_path: display_path(&canonical),
        });
        if rows.len() >= caps.max_files {
            truncated = true;
            break;
        }
    }

    ListDownloadsResult::Ok { rows, truncated }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;

    #[cfg(unix)]
    use std::os::unix::fs::symlink;

    fn temp_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "filelib-{label}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn open_db(dir: &Path) -> AppDb {
        crate::db::open(dir).expect("open db")
    }

    fn caps(max_depth: usize, max_files: usize, max_dirs: usize) -> WalkCaps {
        WalkCaps {
            max_depth,
            max_files,
            max_dirs,
        }
    }

    fn ok(result: ListDownloadsResult) -> (Vec<DownloadRow>, bool) {
        match result {
            ListDownloadsResult::Ok { rows, truncated } => (rows, truncated),
            other => panic!("expected ok, got {other:?}"),
        }
    }

    #[test]
    fn path_rules_strip_verbatim_prefix_and_reject_siblings() {
        assert_eq!(strip_verbatim_str(r"\\?\C:\Users\Me\Downloads"), r"C:\Users\Me\Downloads");
        assert_eq!(
            strip_verbatim_str(r"\\?\UNC\server\share\file.stl"),
            r"\\server\share\file.stl"
        );
        assert_eq!(
            display_path_os(r"\\?\C:\Users\Me\Downloads", true),
            r"C:\Users\Me\Downloads"
        );
        assert_eq!(
            display_path_os(r"\\?\UNC\server\share\file.stl", true),
            r"\\server\share\file.stl"
        );
        assert!(contained_os(
            r"\\?\C:\Users\Me\Downloads\a.stl",
            r"\\?\C:\Users\Me\Downloads",
            true
        ));
        assert!(contained_os(
            r"c:\users\me\downloads\sub\a.stl",
            r"\\?\C:\Users\Me\Downloads",
            true
        ));
        assert!(!contained_os(
            r"\\?\C:\Users\Me\Downloads2\a.stl",
            r"\\?\C:\Users\Me\Downloads",
            true
        ));
        assert!(contained_os("/tmp/downloads/a.stl", "/tmp/downloads", false));
        assert!(!contained_os("/tmp/downloads-extra/a.stl", "/tmp/downloads", false));
        assert_eq!(with_native_separators("prints/boats", true), r"prints\boats");
        assert_eq!(with_native_separators("prints/boats", false), "prints/boats");
        assert!(skip_incomplete_download("Model.STL.crdownload"));
        assert!(skip_incomplete_download("file.PART"));
        assert!(skip_incomplete_download("file.tmp"));
        assert!(!skip_incomplete_download("file.stl"));
        assert!(compatible_file("stl"));
        assert!(compatible_file("zip"));
        assert!(compatible_file("7z"));
        assert!(compatible_file("rar"));
        assert!(!compatible_file("exe"));
        assert!(junction_from_reparse(true, false));
        assert!(!junction_from_reparse(true, true));
        assert!(!junction_from_reparse(false, false));
        assert!(has_reparse_point(0x400));
        assert!(has_reparse_point(0x410));
        assert!(!has_reparse_point(0x10));
        assert!(junction_from_reparse(has_reparse_point(0x400), false));
        assert!(!junction_from_reparse(has_reparse_point(0x400), true));
    }

    #[test]
    fn list_includes_supported_files_and_archives_and_skips_the_rest() {
        let dir = temp_dir("dl-list-basic");
        let root = dir.join("downloads");
        fs::create_dir_all(root.join("prints/boats")).unwrap();
        fs::write(root.join("top.stl"), b"solid").unwrap();
        fs::write(root.join("prints/boats/hull.stl"), b"hull!").unwrap();
        fs::write(root.join("prints/pack.zip"), b"pk").unwrap();
        fs::write(root.join("prints/pack.7z"), b"7z").unwrap();
        fs::write(root.join("prints/pack.rar"), b"rar").unwrap();
        fs::write(root.join("prints/ignore.exe"), b"bin").unwrap();
        fs::write(root.join("part.crdownload"), b"x").unwrap();
        fs::write(root.join("part.part"), b"x").unwrap();
        fs::write(root.join("part.tmp"), b"x").unwrap();
        let canonical = root.canonicalize().unwrap();
        let (rows, truncated) = ok(list_downloads_walk(&canonical, caps(8, 100, 100)));
        assert!(!truncated);
        let names: Vec<_> = rows.iter().map(|row| row.name.as_str()).collect();
        assert!(names.contains(&"top.stl"));
        assert!(names.contains(&"hull.stl"));
        assert!(names.contains(&"pack.zip"));
        assert!(names.contains(&"pack.7z"));
        assert!(names.contains(&"pack.rar"));
        assert!(!names.contains(&"ignore.exe"));
        assert!(!names.iter().any(|name| name.ends_with(".crdownload") || name.ends_with(".part") || name.ends_with(".tmp")));
        let top = rows.iter().find(|row| row.name == "top.stl").unwrap();
        assert!(top.relative_dir.is_empty());
        assert_eq!(top.size_bytes, 5);
        assert!(!top.absolute_path.contains(r"\\?\"));
        assert!(top.absolute_path.ends_with("top.stl"));
        assert!(path_contained(&canonical.join("top.stl"), &canonical));
        assert!(!path_contained(&dir.join("outside.stl"), &canonical));
        assert_eq!(
            relative_dir_display(&canonical, &canonical.join("prints").join("boats").join("hull.stl")),
            with_native_separators("prints/boats", cfg!(windows))
        );
        let hull = rows.iter().find(|row| row.name == "hull.stl").unwrap();
        assert_eq!(
            hull.relative_dir,
            with_native_separators("prints/boats", cfg!(windows))
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn list_includes_depth_seven_and_omits_depth_eight() {
        let dir = temp_dir("dl-depth");
        let root = dir.join("root");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("shallow.stl"), b"s").unwrap();
        let mut kept = root.clone();
        for i in 0..7 {
            kept = kept.join(format!("l{i}"));
        }
        fs::create_dir_all(&kept).unwrap();
        fs::write(kept.join("ok.stl"), b"ok").unwrap();
        let mut dropped = kept.clone();
        dropped = dropped.join("l7");
        fs::create_dir_all(&dropped).unwrap();
        fs::write(dropped.join("too.stl"), b"no").unwrap();
        let (rows, _) = ok(list_downloads_walk(&root.canonicalize().unwrap(), caps(8, 100, 100)));
        let names: Vec<_> = rows.iter().map(|row| row.name.as_str()).collect();
        assert!(names.contains(&"shallow.stl"));
        assert!(names.contains(&"ok.stl"), "a file seven folders down is walkdir depth 8");
        assert!(!names.contains(&"too.stl"), "a file eight folders down is past max_depth 8");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn list_truncates_at_the_production_file_and_directory_caps() {
        let caps = WalkCaps::production();
        assert_eq!(caps.max_depth, 8);
        assert_eq!(caps.max_files, 5000);
        assert_eq!(caps.max_dirs, 2000);

        let files = temp_dir("dl-files-5000");
        let root = files.join("downloads");
        fs::create_dir_all(&root).unwrap();
        for i in 0..(PRODUCTION_MAX_FILES + 1) {
            fs::write(root.join(format!("f{i}.stl")), b"s").unwrap();
        }
        let (rows, truncated) = ok(list_downloads_walk(&root.canonicalize().unwrap(), WalkCaps::production()));
        assert!(truncated);
        assert_eq!(rows.len(), PRODUCTION_MAX_FILES);
        let _ = fs::remove_dir_all(&files);

        let under = temp_dir("dl-dirs-under");
        let under_root = under.join("downloads");
        fs::create_dir_all(&under_root).unwrap();
        for i in 0..(PRODUCTION_MAX_DIRS - 1) {
            fs::create_dir_all(under_root.join(format!("d{i}"))).unwrap();
        }
        fs::write(under_root.join("d0").join("keep.stl"), b"s").unwrap();
        let (rows, truncated) = ok(list_downloads_walk(
            &under_root.canonicalize().unwrap(),
            WalkCaps::production(),
        ));
        assert!(!truncated, "root plus 1999 subfolders is the 2000 directory cap");
        assert!(rows.iter().any(|row| row.name == "keep.stl"));
        let _ = fs::remove_dir_all(&under);

        let over = temp_dir("dl-dirs-over");
        let over_root = over.join("downloads");
        fs::create_dir_all(&over_root).unwrap();
        for i in 0..PRODUCTION_MAX_DIRS {
            fs::create_dir_all(over_root.join(format!("d{i}"))).unwrap();
        }
        let (_, truncated) = ok(list_downloads_walk(
            &over_root.canonicalize().unwrap(),
            WalkCaps::production(),
        ));
        assert!(truncated, "root plus 2000 subfolders exceeds the directory cap");
        let _ = fs::remove_dir_all(&over);
    }

    #[test]
    fn small_caps_stop_at_the_given_file_and_directory_counts() {
        let dir = temp_dir("dl-trunc-small");
        let root = dir.join("downloads");
        fs::create_dir_all(&root).unwrap();
        for i in 0..3 {
            fs::write(root.join(format!("f{i}.stl")), b"s").unwrap();
        }
        let (rows, truncated) = ok(list_downloads_walk(&root.canonicalize().unwrap(), caps(8, 2, 100)));
        assert!(truncated);
        assert_eq!(rows.len(), 2);

        let nested = temp_dir("dl-trunc-dirs-small");
        let nroot = nested.join("downloads");
        fs::create_dir_all(nroot.join("sub")).unwrap();
        fs::write(nroot.join("sub").join("hidden.stl"), b"s").unwrap();
        let (rows, truncated) = ok(list_downloads_walk(&nroot.canonicalize().unwrap(), caps(8, 100, 1)));
        assert!(truncated);
        assert!(rows.is_empty(), "the only directory entered is the root");
        let _ = fs::remove_dir_all(&dir);
        let _ = fs::remove_dir_all(&nested);
    }

    #[cfg(unix)]
    #[test]
    fn symlinks_stay_inside_the_downloads_root_and_dedupe() {
        let dir = temp_dir("dl-links");
        let root = dir.join("downloads");
        let outside = dir.join("outside");
        fs::create_dir_all(root.join("deep")).unwrap();
        fs::create_dir_all(&outside).unwrap();
        let real = root.join("real.stl");
        fs::write(&real, b"solid").unwrap();
        fs::write(root.join("deep").join("secret.stl"), b"deep").unwrap();
        fs::write(outside.join("away.stl"), b"no").unwrap();
        fs::write(outside.join("secret.stl"), b"no").unwrap();
        symlink(&real, root.join("inside-link.stl")).unwrap();
        symlink(root.join("deep").join("secret.stl"), root.join("via-secret.stl")).unwrap();
        symlink(outside.join("away.stl"), root.join("outside-link.stl")).unwrap();
        symlink(&outside, root.join("dir-link")).unwrap();
        symlink(root.join("missing.stl"), root.join("broken.stl")).unwrap();
        fs::write(root.join("partial.crdownload"), b"x").unwrap();
        symlink(root.join("partial.crdownload"), root.join("nice.stl")).unwrap();
        let buried = root.join("a").join("b").join("c");
        fs::create_dir_all(&buried).unwrap();
        fs::write(buried.join("buried.stl"), b"b").unwrap();
        symlink(&buried, root.join("dir-shortcut")).unwrap();

        assert!(is_directory_symlink(&root.join("dir-link")));
        assert!(is_directory_symlink(&root.join("dir-shortcut")));
        assert!(!is_directory_symlink(&real));
        assert!(!should_descend(&root.join("dir-link"), 1));
        assert!(!should_descend(&root.join("dir-shortcut"), 1));
        assert!(should_descend(&root, 0));
        assert!(!is_junction(&root));

        let (rows, _) = ok(list_downloads_walk(&root.canonicalize().unwrap(), caps(1, 100, 100)));
        let names: Vec<_> = rows.iter().map(|row| row.name.as_str()).collect();
        assert_eq!(names.iter().filter(|name| **name == "real.stl").count(), 1);
        assert!(names.contains(&"secret.stl"), "a root file symlink reaches a file past max_depth");
        assert!(!names.contains(&"away.stl"));
        assert!(!names.contains(&"outside-link.stl"));
        assert!(!names.contains(&"nice.stl"));
        assert!(!names.contains(&"broken.stl"));
        let real_row = rows.iter().find(|row| row.name == "real.stl").unwrap();
        assert_eq!(real_row.absolute_path, display_path(&real.canonicalize().unwrap()));
        let secret = rows.iter().find(|row| row.name == "secret.stl").unwrap();
        assert!(secret.absolute_path.contains("deep"));
        assert!(!rows.iter().any(|row| row.absolute_path.contains("outside")));
        assert!(!names.contains(&"buried.stl"));

        let (deeper, _) = ok(list_downloads_walk(&root.canonicalize().unwrap(), caps(2, 100, 100)));
        assert!(
            !deeper.iter().any(|row| row.name == "buried.stl"),
            "a directory symlink must not surface a file that is past max_depth"
        );
        assert!(!deeper.iter().any(|row| row.absolute_path.contains("outside")));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn list_unset_missing_and_only_the_saved_folder() {
        let dir = temp_dir("dl-status");
        let db = open_db(&dir);
        assert!(matches!(list_downloads(&db).unwrap(), ListDownloadsResult::Unset));
        let saved = dir.join("downloads");
        let other = dir.join("other");
        fs::create_dir_all(&saved).unwrap();
        fs::create_dir_all(&other).unwrap();
        fs::write(saved.join("kept.stl"), b"s").unwrap();
        fs::write(other.join("ignored.stl"), b"s").unwrap();
        set_downloads_folder(&db, Some(saved.to_string_lossy().to_string())).unwrap();
        let (rows, truncated) = ok(list_downloads(&db).unwrap());
        assert!(!truncated);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].name, "kept.stl");
        let mut settings = db.settings();
        settings.downloads_folder = Some(dir.join("missing").to_string_lossy().to_string());
        db.save_settings(&settings).unwrap();
        assert!(matches!(list_downloads(&db).unwrap(), ListDownloadsResult::Missing));
        let file = dir.join("file.txt");
        File::create(&file).unwrap();
        settings.downloads_folder = Some(file.to_string_lossy().to_string());
        db.save_settings(&settings).unwrap();
        assert!(matches!(list_downloads(&db).unwrap(), ListDownloadsResult::Missing));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn set_downloads_folder_round_trip_and_validation() {
        let dir = temp_dir("dl-settings");
        let library = dir.join("library");
        let downloads = dir.join("downloads");
        fs::create_dir_all(&library).unwrap();
        fs::create_dir_all(&downloads).unwrap();
        let db = open_db(&dir);
        db.set_library_root(&library).unwrap();
        let saved = set_downloads_folder(&db, Some(downloads.to_string_lossy().to_string())).unwrap();
        let canonical = downloads.canonicalize().unwrap();
        assert_eq!(saved.downloads_folder.as_deref(), Some(display_path(&canonical).as_str()));
        assert!(validate_downloads_folder(&db, None).unwrap().is_none());
        let text = fs::read_to_string(crate::settings::settings_path(db.data_dir.as_path())).unwrap();
        assert!(text.contains("downloadsFolder"));
        assert!(!text.contains(r"\\?\"));
        let missing = set_downloads_folder(&db, Some(dir.join("nope").to_string_lossy().to_string())).unwrap_err();
        assert!(missing.contains("does not exist"));
        let file = dir.join("file.txt");
        File::create(&file).unwrap();
        let file_err = set_downloads_folder(&db, Some(file.to_string_lossy().to_string())).unwrap_err();
        assert!(file_err.contains("not a file") || file_err.contains("folder"));
        let inside = library.join("inner");
        fs::create_dir_all(&inside).unwrap();
        let inside_err = set_downloads_folder(&db, Some(inside.to_string_lossy().to_string())).unwrap_err();
        assert!(inside_err.contains("inside the library"));
        let cleared = set_downloads_folder(&db, None).unwrap();
        assert!(cleared.downloads_folder.is_none());
        assert!(matches!(list_downloads(&db).unwrap(), ListDownloadsResult::Unset));
        let _ = fs::remove_dir_all(&dir);
    }

    #[cfg(unix)]
    #[test]
    fn set_downloads_folder_rejects_a_symlink_into_the_library() {
        let dir = temp_dir("dl-link-lib");
        let library = dir.join("library");
        let inside = library.join("inner");
        fs::create_dir_all(&inside).unwrap();
        let db = open_db(&dir);
        db.set_library_root(&library).unwrap();
        let link = dir.join("via-library");
        symlink(&inside, &link).unwrap();
        let err = set_downloads_folder(&db, Some(link.to_string_lossy().to_string())).unwrap_err();
        assert!(err.contains("inside the library"));
        let outside = dir.join("downloads");
        fs::create_dir_all(&outside).unwrap();
        let outside_link = dir.join("via-outside");
        symlink(&outside, &outside_link).unwrap();
        let saved = set_downloads_folder(&db, Some(outside_link.to_string_lossy().to_string())).unwrap();
        assert_eq!(
            saved.downloads_folder.as_deref(),
            Some(display_path(&outside.canonicalize().unwrap()).as_str())
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn reveal_target_must_stay_inside_the_saved_folder() {
        let dir = temp_dir("dl-reveal");
        let root = dir.join("downloads");
        let outside = dir.join("outside");
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&outside).unwrap();
        let inside = root.join("part.stl");
        let away = outside.join("part.stl");
        fs::write(&inside, b"s").unwrap();
        fs::write(&away, b"s").unwrap();
        let allowed = allowed_reveal_target(&root, &inside).unwrap();
        assert_eq!(allowed, PathBuf::from(display_path(&inside.canonicalize().unwrap())));
        let err = allowed_reveal_target(&root, &away).unwrap_err();
        assert!(err.contains("outside"));
        let missing = allowed_reveal_target(&dir.join("missing"), &inside).unwrap_err();
        assert!(missing.contains("missing"));
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(&away, root.join("escape.stl")).unwrap();
            let escaped = allowed_reveal_target(&root, &root.join("escape.stl")).unwrap_err();
            assert!(escaped.contains("outside"));
        }
        let _ = fs::remove_dir_all(&dir);
    }
}
