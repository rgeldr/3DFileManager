/// Drop folders this import created when nothing was stored in them or in a
/// descendant. Folders that already existed are not in `created` and stay,
/// even when they are empty.
fn prune_created_empty_folders(
    db: &mut AppDb,
    library_root: &Path,
    created: &[(i64, String)],
) -> Result<(), String> {
    for (id, rel) in created.iter().rev() {
        let still_there: bool = db
            .conn
            .query_row("SELECT 1 FROM folders WHERE id = ?1", [id], |_| Ok(true))
            .optional()
            .map_err(|e| e.to_string())?
            .unwrap_or(false);
        if !still_there {
            continue;
        }
        let child: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM folders WHERE parent_id = ?1",
                [id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        let files: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM files WHERE folder_id = ?1",
                [id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if child > 0 || files > 0 {
            continue;
        }
        let dir = library_root.join(rel);
        if dir.exists() && !dir_is_completely_empty(&dir) {
            continue;
        }
        db.delete_folder(*id)?;
    }
    Ok(())
}

fn remove_empty_created_dirs(library_root: &Path, created: &[(i64, String)]) {
    for (_, rel) in created.iter().rev() {
        let dir = library_root.join(rel);
        if dir_is_completely_empty(&dir) {
            let _ = fs::remove_dir(&dir);
        }
    }
}

#[cfg(test)]
pub fn recycle_paths(paths: &[String]) -> Result<Vec<String>, String> {
    let (failed, _) = recycle_paths_with(paths, &[], &std::sync::atomic::AtomicBool::new(false), |_| {})?;
    Ok(failed)
}

pub fn recycle_paths_with<F: FnMut(crate::relocate::DiskProgress)>(
    paths: &[String],
    roots: &[String],
    cancel: &std::sync::atomic::AtomicBool,
    mut progress: F,
) -> Result<(Vec<String>, bool), String> {
    let total = paths.len() as u32;
    let mut failed = Vec::new();
    let mut deleted = Vec::new();
    for (index, path) in paths.iter().enumerate() {
        if cancel.load(std::sync::atomic::Ordering::SeqCst) {
            prune_emptied_subfolders(&deleted, roots);
            return Ok((failed, true));
        }
        let name = Path::new(path)
            .file_name()
            .map(|item| item.to_string_lossy().to_string())
            .unwrap_or_else(|| path.clone());
        progress(crate::relocate::DiskProgress {
            current: index as u32,
            total,
            name,
            bytes_done: 0,
            bytes_total: 0,
            cancellable: true,
        });
        let file = PathBuf::from(path);
        if file.is_dir() {
            // Folders are never sent to the Recycle Bin, even when a path list
            // includes one. Files that remain inside stay where they are.
        } else if file.is_file() {
            if let Err(err) = trash::delete(&file) {
                failed.push(format!("{path}: {err}"));
            } else {
                deleted.push(file);
            }
        }
        progress(crate::relocate::DiskProgress {
            current: (index as u32) + 1,
            total,
            name: String::new(),
            bytes_done: 0,
            bytes_total: 0,
            cancellable: true,
        });
    }
    prune_emptied_subfolders(&deleted, roots);
    Ok((failed, false))
}

/// Remove source subfolders that became empty because their files were recycled.
/// The import root stays, and so does any directory that still has an entry,
/// including a hidden file.
fn prune_emptied_subfolders(deleted: &[PathBuf], roots: &[String]) {
    let roots: Vec<PathBuf> = roots.iter().map(PathBuf::from).collect();
    for file in deleted {
        let mut current = file.parent().map(Path::to_path_buf);
        while let Some(dir) = current {
            if roots.iter().any(|root| root == &dir) {
                break;
            }
            if !roots.iter().any(|root| dir.starts_with(root)) {
                break;
            }
            if !dir_is_completely_empty(&dir) {
                break;
            }
            if fs::remove_dir(&dir).is_err() {
                break;
            }
            current = dir.parent().map(Path::to_path_buf);
        }
    }
}

fn dir_is_completely_empty(dir: &Path) -> bool {
    match fs::read_dir(dir) {
        Ok(mut entries) => entries.next().is_none(),
        Err(_) => false,
    }
}
