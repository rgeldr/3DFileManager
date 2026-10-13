use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use walkdir::WalkDir;

use crate::db::AppDb;
use crate::import::hash_file;
use crate::names::{extension_of, is_supported_file, sanitize_component};

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RescanSummary {
    pub added_folders: u32,
    pub added_files: u32,
    pub relocated: u32,
    pub missing: u32,
}

pub fn rescan<F: Fn(String)>(db: &AppDb, progress: F) -> Result<RescanSummary, String> {
    let root = db.library_root()?;
    if !root.exists() {
        return Err("The library folder is missing.".into());
    }
    progress("Reading folders".into());
    let mut disk_dirs: Vec<PathBuf> = Vec::new();
    let mut disk_files: Vec<PathBuf> = Vec::new();
    for entry in WalkDir::new(&root).follow_links(false) {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.file_type().is_dir() {
            if entry.path() != root {
                disk_dirs.push(entry.into_path());
            }
        } else if entry.file_type().is_file() {
            let ext = extension_of(&entry.file_name().to_string_lossy());
            if is_supported_file(&ext) {
                disk_files.push(entry.into_path());
            }
        }
    }
    disk_dirs.sort();
    let mut added_folders = 0u32;
    for dir in &disk_dirs {
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

    progress("Checking files".into());
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
    for file in &disk_files {
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
    }
    let mut missing = 0u32;
    for row in indexed {
        if !seen_ids.contains(&row.id) {
            db.mark_missing(row.id, true)?;
            missing += 1;
        } else {
            db.mark_missing(row.id, false)?;
        }
    }
    progress("Rescan finished".into());
    Ok(RescanSummary {
        added_folders,
        added_files,
        relocated,
        missing,
    })
}

fn rel_string(root: &Path, path: &Path) -> Result<String, String> {
    let rel = path.strip_prefix(root).map_err(|e| e.to_string())?;
    Ok(rel.to_string_lossy().replace('\\', "/"))
}

fn folder_id_for_file(db: &AppDb, file_rel: &str) -> Result<Option<i64>, String> {
    match file_rel.rsplit_once('/') {
        Some((dir, _)) if !dir.is_empty() => db.folder_id_by_relpath(dir),
        _ => Ok(None),
    }
}
