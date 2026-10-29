use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use walkdir::WalkDir;

use crate::db::{AppDb, IndexRow};
use crate::import::hash_file;
use crate::names::{extension_of, is_supported_file, sanitize_component};
use crate::relocate::DiskProgress;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RescanSummary {
    pub added_folders: u32,
    pub added_files: u32,
    pub relocated: u32,
    pub missing: u32,
    pub cancelled: bool,
}

#[cfg(test)]
pub fn rescan<F: FnMut(DiskProgress)>(db: &AppDb, progress: F) -> Result<RescanSummary, String> {
    rescan_with(db, &AtomicBool::new(false), None, progress)
}

/// `scope` is a folder relpath. `None` scans the whole library.
pub fn rescan_with<F: FnMut(DiskProgress)>(
    db: &AppDb,
    cancel: &AtomicBool,
    scope: Option<&str>,
    mut progress: F,
) -> Result<RescanSummary, String> {
    let root = db.library_root()?;
    if !root.exists() {
        return Err("The library folder is missing.".into());
    }
    let start = match scope.map(str::trim).filter(|rel| !rel.is_empty()) {
        Some(rel) => root.join(rel),
        None => root.clone(),
    };
    if !start.is_dir() {
        return Err("That folder is missing from the library.".into());
    }
    progress(DiskProgress {
        current: 0,
        total: 0,
        name: "Counting files".into(),
        bytes_done: 0,
        bytes_total: 0,
        cancellable: true,
    });
    let mut disk_dirs: Vec<PathBuf> = Vec::new();
    let mut disk_files: Vec<(PathBuf, u64)> = Vec::new();
    for entry in WalkDir::new(&start).follow_links(false) {
        if cancel.load(Ordering::SeqCst) {
            return Ok(empty_cancelled());
        }
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.file_type().is_dir() {
            if entry.path() != start {
                disk_dirs.push(entry.into_path());
            }
        } else if entry.file_type().is_file() {
            let ext = extension_of(&entry.file_name().to_string_lossy());
            if is_supported_file(&ext) {
                let len = entry.metadata().map(|meta| meta.len()).unwrap_or(0);
                disk_files.push((entry.into_path(), len));
            }
        }
    }
    disk_dirs.sort();
    let mut added_folders = 0u32;
    for dir in &disk_dirs {
        if cancel.load(Ordering::SeqCst) {
            return Ok(RescanSummary {
                added_folders,
                added_files: 0,
                relocated: 0,
                missing: 0,
                cancelled: true,
            });
        }
        let rel = rel_string(&root, dir)?;
        if db.folder_id_by_relpath(&rel)?.is_none() {
            let parent_rel = dir.parent().map(|p| rel_string(&root, p)).transpose()?;
            let parent_id = match parent_rel.as_deref() {
                Some("") | None => None,
                Some(rel) => db.folder_id_by_relpath(rel)?,
            };
            let name = dir
                .file_name()
                .map(|s| sanitize_component(&s.to_string_lossy()))
                .unwrap_or_else(|| "folder".into());
            db.conn
                .execute(
                    "INSERT INTO folders (parent_id, name, sort_order, relpath) VALUES (?1, ?2, 0, ?3)",
                    rusqlite::params![parent_id, name, rel],
                )
                .map_err(|e| e.to_string())?;
            added_folders += 1;
        }
    }

    let bytes_total: u64 = disk_files.iter().map(|(_, len)| *len).sum();
    let file_total = disk_files.len() as u32;
    progress(DiskProgress {
        current: 0,
        total: file_total,
        name: String::new(),
        bytes_done: 0,
        bytes_total,
        cancellable: true,
    });
    let indexed = db.all_file_index()?;
    let mut by_path: HashMap<String, i64> = HashMap::new();
    let mut by_sha: HashMap<String, Vec<i64>> = HashMap::new();
    let mut details: HashMap<i64, &IndexRow> = HashMap::new();
    for row in &indexed {
        by_path.insert(row.stored_relpath.clone(), row.id);
        by_sha.entry(row.sha256.clone()).or_default().push(row.id);
        details.insert(row.id, row);
    }
    let mut seen_ids: HashSet<i64> = HashSet::new();
    let mut added_files = 0u32;
    let mut relocated = 0u32;
    let mut bytes_done = 0u64;
    for (index, (file, len)) in disk_files.iter().enumerate() {
        if cancel.load(Ordering::SeqCst) {
            return Ok(RescanSummary {
                added_folders,
                added_files,
                relocated,
                missing: 0,
                cancelled: true,
            });
        }
        let name = file
            .file_name()
            .map(|item| item.to_string_lossy().to_string())
            .unwrap_or_default();
        progress(DiskProgress {
            current: index as u32,
            total: file_total,
            name: name.clone(),
            bytes_done,
            bytes_total,
            cancellable: true,
        });
        let rel = rel_string(&root, file)?;
        if let Some(id) = by_path.get(&rel).copied() {
            seen_ids.insert(id);
            let meta = file.metadata().map_err(|e| e.to_string())?;
            let mtime = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);
            let folder_id = folder_id_for_file(db, &rel)?;
            let size = meta.len() as i64;
            let row = details[&id];
            let unchanged = row.stored_relpath == rel
                && row.folder_id == folder_id
                && row.size_bytes == size
                && row.mtime == mtime
                && !row.missing;
            if !unchanged {
                db.update_path(id, &rel, folder_id, size, mtime)?;
            }
            bytes_done += len;
            continue;
        }
        let sha = hash_file(file)?;
        if let Some(ids) = by_sha.get(&sha) {
            if let Some(id) = ids.iter().copied().find(|id| !seen_ids.contains(id)) {
                let meta = file.metadata().map_err(|e| e.to_string())?;
                let mtime = meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs() as i64)
                    .unwrap_or(0);
                let folder_id = folder_id_for_file(db, &rel)?;
                db.update_path(id, &rel, folder_id, meta.len() as i64, mtime)?;
                seen_ids.insert(id);
                by_path.insert(rel, id);
                relocated += 1;
                bytes_done += len;
                continue;
            }
        }
        let meta = file.metadata().map_err(|e| e.to_string())?;
        let mtime = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        let folder_id = folder_id_for_file(db, &rel)?;
        let name = file
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "file".into());
        let ext = extension_of(&name);
        let id = db.insert_file(
            &name,
            &rel,
            &ext,
            meta.len() as i64,
            &sha,
            mtime,
            folder_id,
            None,
        )?;
        seen_ids.insert(id);
        by_sha.entry(sha).or_default().push(id);
        added_files += 1;
        bytes_done += len;
    }
    let mut missing = 0u32;
    for row in &indexed {
        if cancel.load(Ordering::SeqCst) {
            return Ok(RescanSummary {
                added_folders,
                added_files,
                relocated,
                missing,
                cancelled: true,
            });
        }
        if !seen_ids.contains(&row.id) && in_rescan_scope(&row.stored_relpath, scope) {
            if !row.missing {
                db.mark_missing(row.id, true)?;
            }
            missing += 1;
        }
    }
    progress(DiskProgress {
        current: file_total,
        total: file_total,
        name: String::new(),
        bytes_done,
        bytes_total,
        cancellable: false,
    });
    Ok(RescanSummary {
        added_folders,
        added_files,
        relocated,
        missing,
        cancelled: false,
    })
}

fn empty_cancelled() -> RescanSummary {
    RescanSummary {
        added_folders: 0,
        added_files: 0,
        relocated: 0,
        missing: 0,
        cancelled: true,
    }
}

pub fn in_rescan_scope(stored_relpath: &str, scope: Option<&str>) -> bool {
    let Some(scope) = scope.map(str::trim).filter(|rel| !rel.is_empty()) else {
        return true;
    };
    let prefix = format!("{scope}/");
    stored_relpath == scope || stored_relpath.starts_with(&prefix)
}

fn rel_string(root: &Path, path: &Path) -> Result<String, String> {
    let rel = path.strip_prefix(root).map_err(|e| e.to_string())?;
    Ok(rel.to_string_lossy().replace('\\', "/"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{self, FolderFilter};
    use crate::settings::Settings;
    use std::sync::atomic::AtomicBool;

    #[test]
    fn rescan_adds_a_file_on_disk_and_marks_a_missing_catalog_row() {
        let dir = std::env::temp_dir().join(format!("filelib-rescan-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let db = db::open(&dir).unwrap();
        let root = dir.join("library");
        std::fs::create_dir_all(&root).unwrap();
        let mut settings = Settings::default();
        settings.library_root = Some(root.to_string_lossy().to_string());
        db.save_settings(&settings).unwrap();
        std::fs::write(root.join("new.stl"), b"solid new").unwrap();
        db.insert_file("gone.stl", "gone.stl", "stl", 1, "sha-gone", 1, None, None)
            .unwrap();
        let summary = rescan_with(&db, &AtomicBool::new(false), None, |_| {}).unwrap();
        assert!(!summary.cancelled);
        assert_eq!(summary.added_files, 1);
        assert_eq!(summary.missing, 1);
        let rows = db.list_files(FolderFilter::All, "", "", "", "name", "asc").unwrap();
        assert!(rows.iter().any(|file| file.original_name == "new.stl"));
        let missing = db.missing_files().unwrap();
        assert_eq!(missing.len(), 1);
        assert_eq!(missing[0].original_name, "gone.stl");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn rescan_skips_rows_whose_path_size_mtime_and_missing_flag_are_unchanged() {
        let dir = std::env::temp_dir().join(format!("filelib-rescan-skip-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let db = db::open(&dir).unwrap();
        let root = dir.join("library");
        std::fs::create_dir_all(&root).unwrap();
        let mut settings = Settings::default();
        settings.library_root = Some(root.to_string_lossy().to_string());
        db.save_settings(&settings).unwrap();
        std::fs::write(root.join("kept.stl"), b"solid kept").unwrap();
        db.insert_file("gone.stl", "gone.stl", "stl", 1, "sha-gone", 1, None, None)
            .unwrap();
        let first = rescan_with(&db, &AtomicBool::new(false), None, |_| {}).unwrap();
        assert_eq!(first.added_files, 1);
        assert_eq!(first.missing, 1);
        let changes = db.conn.total_changes();
        let again = rescan_with(&db, &AtomicBool::new(false), None, |_| {}).unwrap();
        assert_eq!(again.added_files, 0);
        assert_eq!(again.relocated, 0);
        assert_eq!(again.missing, 1);
        assert_eq!(db.conn.total_changes(), changes);
        std::fs::write(root.join("gone.stl"), b"x").unwrap();
        let restored = rescan_with(&db, &AtomicBool::new(false), None, |_| {}).unwrap();
        assert_eq!(restored.missing, 0);
        assert!(db.missing_files().unwrap().is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn rescan_scope_marks_only_the_folder_subtree() {
        assert!(in_rescan_scope("Toys/a.stl", Some("Toys")));
        assert!(in_rescan_scope("Toys/Nested/a.stl", Some("Toys")));
        assert!(!in_rescan_scope("Toyshelf/a.stl", Some("Toys")));
        assert!(!in_rescan_scope("other.stl", Some("Toys")));
        assert!(in_rescan_scope("other.stl", None));

        let dir = std::env::temp_dir().join(format!("filelib-rescan-scope-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let db = db::open(&dir).unwrap();
        let root = dir.join("library");
        std::fs::create_dir_all(&root).unwrap();
        let mut settings = Settings::default();
        settings.library_root = Some(root.to_string_lossy().to_string());
        db.save_settings(&settings).unwrap();
        let toys = db.create_folder(None, "Toys", 0).unwrap();
        std::fs::write(root.join(&toys.relpath).join("kept.stl"), b"kept").unwrap();
        std::fs::write(root.join("other.stl"), b"other").unwrap();
        db.insert_file(
            "gone.stl",
            &format!("{}/gone.stl", toys.relpath),
            "stl",
            1,
            "sha-gone",
            1,
            Some(toys.id),
            None,
        )
        .unwrap();
        db.insert_file("other.stl", "other.stl", "stl", 1, "sha-other", 1, None, None)
            .unwrap();
        let summary = rescan_with(&db, &AtomicBool::new(false), Some(&toys.relpath), |_| {}).unwrap();
        assert_eq!(summary.added_files, 1);
        assert_eq!(summary.missing, 1);
        let missing = db.missing_files().unwrap();
        assert_eq!(missing.len(), 1);
        assert_eq!(missing[0].original_name, "gone.stl");
        let rows = db.list_files(FolderFilter::All, "", "", "", "name", "asc").unwrap();
        assert!(rows.iter().any(|file| file.original_name == "kept.stl" && !file.missing));
        assert!(rows.iter().any(|file| file.original_name == "other.stl" && !file.missing));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn folder_lookup_and_relative_paths_follow_the_library_root() {
        let summary: RescanSummary = empty_cancelled();
        assert!(summary.cancelled);
        assert_eq!(summary.added_folders, 0);
        assert_eq!(summary.added_files, 0);
        assert_eq!(summary.relocated, 0);
        assert_eq!(summary.missing, 0);
        let built = RescanSummary {
            added_folders: 2,
            added_files: 3,
            relocated: 1,
            missing: 4,
            cancelled: false,
        };
        assert_eq!(built.added_folders, 2);
        assert_eq!(built.added_files, 3);
        assert_eq!(built.relocated, 1);
        assert_eq!(built.missing, 4);
        assert!(!built.cancelled);

        let dir = std::env::temp_dir().join(format!("filelib-rescan-rel-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let db = db::open(&dir).unwrap();
        let root = dir.join("library");
        std::fs::create_dir_all(&root).unwrap();
        let mut settings = Settings::default();
        settings.library_root = Some(root.to_string_lossy().to_string());
        db.save_settings(&settings).unwrap();
        let toys = db.create_folder(None, "Toys", 0).unwrap();
        let nested = db.create_folder(Some(toys.id), "Nested", 0).unwrap();
        assert_eq!(folder_id_for_file(&db, "Toys/a.stl").unwrap(), Some(toys.id));
        assert_eq!(
            folder_id_for_file(&db, "Toys/Nested/a.stl").unwrap(),
            Some(nested.id)
        );
        assert_eq!(folder_id_for_file(&db, "a.stl").unwrap(), None);
        assert_eq!(folder_id_for_file(&db, "Nope/a.stl").unwrap(), None);
        assert_eq!(
            rel_string(&root, &root.join("Toys").join("a.stl")).unwrap(),
            "Toys/a.stl"
        );
        let outside = rel_string(&root, &dir.join("outside.stl")).unwrap_err();
        assert!(!outside.is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }
}

fn folder_id_for_file(db: &AppDb, file_rel: &str) -> Result<Option<i64>, String> {
    match file_rel.rsplit_once('/') {
        Some((dir, _)) if !dir.is_empty() => db.folder_id_by_relpath(dir),
        _ => Ok(None),
    }
}
