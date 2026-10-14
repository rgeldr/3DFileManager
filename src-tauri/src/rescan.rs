use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use walkdir::WalkDir;

use crate::db::AppDb;
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
    rescan_with(db, &AtomicBool::new(false), progress)
}

pub fn rescan_with<F: FnMut(DiskProgress)>(
    db: &AppDb,
    cancel: &AtomicBool,
    mut progress: F,
) -> Result<RescanSummary, String> {
    let root = db.library_root()?;
    if !root.exists() {
        return Err("The library folder is missing.".into());
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
    for entry in WalkDir::new(&root).follow_links(false) {
        if cancel.load(Ordering::SeqCst) {
            return Ok(empty_cancelled());
        }
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.file_type().is_dir() {
            if entry.path() != root {
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
    for row in &indexed {
        by_path.insert(row.stored_relpath.clone(), row.id);
        by_sha.entry(row.sha256.clone()).or_default().push(row.id);
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
            db.update_path(id, &rel, folder_id, meta.len() as i64, mtime)?;
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
    for row in indexed {
        if cancel.load(Ordering::SeqCst) {
            return Ok(RescanSummary {
                added_folders,
                added_files,
                relocated,
                missing,
                cancelled: true,
            });
        }
        if !seen_ids.contains(&row.id) {
            db.mark_missing(row.id, true)?;
            missing += 1;
        } else {
            db.mark_missing(row.id, false)?;
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
        let summary = rescan_with(&db, &AtomicBool::new(false), |_| {}).unwrap();
        assert!(!summary.cancelled);
        assert_eq!(summary.added_files, 1);
        assert_eq!(summary.missing, 1);
        let rows = db.list_files(FolderFilter::All, "", "", "", "name").unwrap();
        assert!(rows.iter().any(|file| file.original_name == "new.stl"));
        let missing = db.missing_files().unwrap();
        assert_eq!(missing.len(), 1);
        assert_eq!(missing[0].original_name, "gone.stl");
        let _ = std::fs::remove_dir_all(&dir);
    }
}

fn folder_id_for_file(db: &AppDb, file_rel: &str) -> Result<Option<i64>, String> {
    match file_rel.rsplit_once('/') {
        Some((dir, _)) if !dir.is_empty() => db.folder_id_by_relpath(dir),
        _ => Ok(None),
    }
}
