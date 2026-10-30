use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use walkdir::WalkDir;

use crate::db::AppDb;
use crate::import::plan::path_within;
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

fn skip_incomplete_download(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.ends_with(".crdownload") || lower.ends_with(".part") || lower.ends_with(".tmp")
}

fn compatible_file(ext: &str) -> bool {
    is_supported_file(ext) || is_archive(ext)
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
    rel.to_string_lossy().replace('\\', "/")
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
        if path_within(&canonical, &library) {
            return Err("The Downloads folder cannot be inside the library.".into());
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
    settings.downloads_folder = validated.map(|p| p.to_string_lossy().to_string());
    db.save_settings(&settings)?;
    Ok(settings)
}

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

fn list_downloads_walk(root: &Path, caps: WalkCaps) -> ListDownloadsResult {
    let mut rows = Vec::new();
    let mut seen = HashSet::new();
    let mut dirs_entered = 0usize;
    let mut truncated = false;

    for entry in WalkDir::new(root)
        .max_depth(caps.max_depth)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let entry_type = entry.file_type();
        if entry_type.is_dir() {
            dirs_entered += 1;
            if dirs_entered > caps.max_dirs {
                truncated = true;
                break;
            }
            continue;
        }
        if !entry_type.is_file() {
            continue;
        }
        let path = entry.path();
        let file_name = match path.file_name().and_then(|n| n.to_str()) {
            Some(name) if !skip_incomplete_download(name) => name,
            _ => continue,
        };
        let ext = extension_of(file_name);
        if !compatible_file(&ext) {
            continue;
        }
        let meta = match fs::metadata(path) {
            Ok(meta) => meta,
            Err(_) => continue,
        };
        let Ok(canonical) = path.canonicalize() else {
            continue;
        };
        if !path_within(&canonical, root) {
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
            name: file_name.to_string(),
            relative_dir: relative_dir_display(root, &canonical),
            ext,
            size_bytes: meta.len(),
            mtime,
            absolute_path: canonical.to_string_lossy().to_string(),
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
    use std::fs::{self, File};
    use std::io::Write;
    use std::os::unix::fs::symlink;

    fn temp_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("filelib-{label}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn open_db(dir: &Path) -> AppDb {
        crate::db::open(dir).expect("open db")
    }

    #[test]
    fn list_includes_stl_and_zip_in_subfolder() {
        let dir = temp_dir("dl-list-basic");
        let root = dir.join("downloads");
        fs::create_dir_all(root.join("boats")).unwrap();
        fs::write(root.join("top.stl"), b"solid").unwrap();
        fs::write(root.join("boats/pack.zip"), b"pk").unwrap();
        fs::write(root.join("boats/ignore.exe"), b"bin").unwrap();
        fs::write(root.join("part.crdownload"), b"x").unwrap();
        let caps = WalkCaps {
            max_depth: 8,
            max_files: 100,
            max_dirs: 100,
        };
        let result = list_downloads_walk(&root.canonicalize().unwrap(), caps);
        let ListDownloadsResult::Ok { rows, truncated } = result else {
            panic!("expected ok");
        };
        assert!(!truncated);
        assert_eq!(rows.len(), 2);
        assert!(rows.iter().any(|r| r.name == "top.stl" && r.relative_dir.is_empty()));
        assert!(rows.iter().any(|r| r.name == "pack.zip" && r.relative_dir == "boats"));
        assert!(!rows.iter().any(|r| r.name == "ignore.exe"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn list_omits_file_past_depth_eight() {
        let dir = temp_dir("dl-depth");
        let mut path = dir.join("root");
        fs::create_dir_all(&path).unwrap();
        for i in 0..9 {
            path = path.join(format!("d{i}"));
            fs::create_dir_all(&path).unwrap();
        }
        fs::write(path.join("deep.stl"), b"solid").unwrap();
        let caps = WalkCaps {
            max_depth: 8,
            max_files: 100,
            max_dirs: 100,
        };
        let result = list_downloads_walk(&dir.join("root").canonicalize().unwrap(), caps);
        let ListDownloadsResult::Ok { rows, .. } = result else {
            panic!("expected ok");
        };
        assert!(rows.is_empty());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn list_does_not_descend_directory_symlink() {
        let dir = temp_dir("dl-dir-link");
        let root = dir.join("downloads");
        let outside = dir.join("outside");
        fs::create_dir_all(root).unwrap();
        fs::create_dir_all(outside).unwrap();
        fs::write(outside.join("secret.stl"), b"solid").unwrap();
        symlink(&outside, root.join("link")).unwrap();
        let caps = WalkCaps {
            max_depth: 8,
            max_files: 100,
            max_dirs: 100,
        };
        let result = list_downloads_walk(&root.canonicalize().unwrap(), caps);
        let ListDownloadsResult::Ok { rows, .. } = result else {
            panic!("expected ok");
        };
        assert!(rows.is_empty());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn list_omits_file_symlink_outside_and_dedupes_inside() {
        let dir = temp_dir("dl-file-link");
        let root = dir.join("downloads");
        let outside = dir.join("outside");
        fs::create_dir_all(root).unwrap();
        fs::create_dir_all(outside).unwrap();
        let target = root.join("real.stl");
        fs::write(&target, b"solid").unwrap();
        fs::write(outside.join("away.stl"), b"solid").unwrap();
        symlink(outside.join("away.stl"), root.join("outside-link.stl")).unwrap();
        symlink(&target, root.join("inside-link.stl")).unwrap();
        let caps = WalkCaps {
            max_depth: 8,
            max_files: 100,
            max_dirs: 100,
        };
        let result = list_downloads_walk(&root.canonicalize().unwrap(), caps);
        let ListDownloadsResult::Ok { rows, .. } = result else {
            panic!("expected ok");
        };
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].name, "real.stl");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn list_truncates_at_file_and_directory_caps() {
        let dir = temp_dir("dl-trunc");
        let root = dir.join("downloads");
        fs::create_dir_all(&root).unwrap();
        for i in 0..3 {
            fs::write(root.join(format!("f{i}.stl")), b"s").unwrap();
        }
        let file_caps = WalkCaps {
            max_depth: 8,
            max_files: 2,
            max_dirs: 100,
        };
        let ListDownloadsResult::Ok { truncated, .. } = list_downloads_walk(&root.canonicalize().unwrap(), file_caps)
        else {
            panic!("expected ok");
        };
        assert!(truncated);

        let nested = temp_dir("dl-trunc-dirs");
        let nroot = nested.join("downloads");
        fs::create_dir_all(&nroot).unwrap();
        let mut current = nroot.clone();
        for i in 0..4 {
            current = current.join(format!("d{i}"));
            fs::create_dir_all(&current).unwrap();
        }
        let dir_caps = WalkCaps {
            max_depth: 8,
            max_files: 100,
            max_dirs: 3,
        };
        let ListDownloadsResult::Ok { truncated: dir_trunc, .. } =
            list_downloads_walk(&nroot.canonicalize().unwrap(), dir_caps)
        else {
            panic!("expected ok");
        };
        assert!(dir_trunc);
        let _ = fs::remove_dir_all(&dir);
        let _ = fs::remove_dir_all(&nested);
    }

    #[test]
    fn list_unset_and_missing() {
        let dir = temp_dir("dl-status");
        let db = open_db(&dir);
        assert!(matches!(list_downloads(&db).unwrap(), ListDownloadsResult::Unset));
        let mut settings = db.settings();
        settings.downloads_folder = Some(dir.join("missing").to_string_lossy().to_string());
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
        assert_eq!(
            saved.downloads_folder.as_deref(),
            Some(downloads.canonicalize().unwrap().to_string_lossy().as_ref())
        );
        assert!(set_downloads_folder(&db, Some(dir.join("nope").to_string_lossy().to_string())).is_err());
        let file = dir.join("file.txt");
        File::create(&file).unwrap();
        assert!(set_downloads_folder(&db, Some(file.to_string_lossy().to_string())).is_err());
        let inside = library.join("inner");
        fs::create_dir_all(&inside).unwrap();
        assert!(set_downloads_folder(&db, Some(inside.to_string_lossy().to_string())).is_err());
        let cleared = set_downloads_folder(&db, None).unwrap();
        assert!(cleared.downloads_folder.is_none());
        let _ = fs::remove_dir_all(&dir);
    }
}
