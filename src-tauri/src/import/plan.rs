struct FolderCache {
    relpath_by_id: HashMap<i64, String>,
    id_by_relpath: HashMap<String, i64>,
    /// Folders inserted by this import, parents before children.
    created: Vec<(i64, String)>,
}

impl FolderCache {
    fn new(db: &AppDb) -> Result<Self, String> {
        let mut relpath_by_id = HashMap::new();
        let mut id_by_relpath = HashMap::new();
        for folder in db.list_folders()? {
            relpath_by_id.insert(folder.id, folder.relpath.clone());
            id_by_relpath.insert(folder.relpath, folder.id);
        }
        Ok(Self {
            relpath_by_id,
            id_by_relpath,
            created: Vec::new(),
        })
    }

    fn ensure_folder_chain(
        &mut self,
        db: &mut AppDb,
        library_root: &Path,
        parent_id: Option<i64>,
        relative_dir: &Path,
    ) -> Result<Option<i64>, String> {
        let mut current = parent_id;
        if relative_dir.as_os_str().is_empty() {
            return Ok(current);
        }
        for component in relative_dir.components() {
            let raw = component.as_os_str().to_string_lossy();
            if raw == "." || raw.is_empty() {
                continue;
            }
            let name = sanitize_component(&raw);
            let parent_rel = match current {
                Some(id) => Some(
                    self.relpath_by_id
                        .get(&id)
                        .cloned()
                        .ok_or_else(|| format!("Folder {id} was not found."))?,
                ),
                None => None,
            };
            let relpath = match &parent_rel {
                Some(rel) => format!("{rel}/{name}"),
                None => name.clone(),
            };
            if let Some(id) = self.id_by_relpath.get(&relpath) {
                current = Some(*id);
                continue;
            }
            fs::create_dir_all(library_root.join(&relpath)).map_err(|e| e.to_string())?;
            db.conn
                .execute(
                    "INSERT INTO folders (parent_id, name, sort_order, relpath) VALUES (?1, ?2, 0, ?3)",
                    rusqlite::params![current, name, relpath],
                )
                .map_err(|e| e.to_string())?;
            let id = db.conn.last_insert_rowid();
            self.relpath_by_id.insert(id, relpath.clone());
            self.id_by_relpath.insert(relpath.clone(), id);
            self.created.push((id, relpath));
            current = Some(id);
        }
        Ok(current)
    }

    fn dest_dir(&self, library_root: &Path, folder_id: Option<i64>) -> Result<PathBuf, String> {
        match folder_id {
            Some(id) => {
                let rel = self
                    .relpath_by_id
                    .get(&id)
                    .ok_or_else(|| format!("Folder {id} was not found."))?;
                Ok(library_root.join(rel))
            }
            None => Ok(library_root.to_path_buf()),
        }
    }
}

pub fn import_paths<F: FnMut(ImportProgress)>(
    db: &mut AppDb,
    paths: &[String],
    target_folder: Option<i64>,
    cancelled: &AtomicBool,
    on_progress: F,
) -> Result<ImportOutcome, String> {
    let library_root = db.library_root()?;
    let mut folder_cache = FolderCache::new(db)?;
    let mut batch = ImportBatch::begin(db)?;
    let mut summary = ImportOutcome {
        imported_ids: Vec::new(),
        imported_count: 0,
        duplicate_count: 0,
        unsupported_count: 0,
        failed: Vec::new(),
        recycle_paths: Vec::new(),
        recycle_roots: Vec::new(),
        cancelled: false,
        pending_hash_count: 0,
    };
    let mut jobs = Vec::new();
    for raw in paths {
        let path = PathBuf::from(raw);
        if !path.exists() {
            summary.failed.push(format!("Missing path: {raw}"));
            continue;
        }
        if path_within(&path, &library_root) {
            summary
                .failed
                .push(format!("Skipped a path inside the library: {raw}"));
            continue;
        }
        jobs.push(path);
    }
    let mut progress = ImportProgressCtx {
        current: 0,
        total: 0,
        on_progress,
        pending_message: None,
    };
    progress.emit("Counting files");
    let file_total = count_jobs(&jobs, cancelled)?;
    if cancelled.load(Ordering::SeqCst) {
        summary.cancelled = true;
        if batch.finish(db).is_err() {
            batch.rollback(db);
            return Err("Import batch commit failed.".into());
        }
        summary.pending_hash_count = db.count_unhashed()? as u32;
        progress.emit("Import stopped");
        return Ok(summary);
    }
    progress.total = file_total;
    progress.emit("Importing…");
    let import_result = (|| -> Result<(), String> {
        for path in jobs {
            if cancelled.load(Ordering::SeqCst) {
                summary.cancelled = true;
                break;
            }
            let ext = extension_of(&path.file_name().unwrap_or_default().to_string_lossy());
            if path.is_dir() {
                summary
                    .recycle_roots
                    .push(path.to_string_lossy().to_string());
                import_tree(
                    db,
                    &library_root,
                    &mut folder_cache,
                    &mut batch,
                    &path,
                    target_folder,
                    Path::new(""),
                    None,
                    0,
                    cancelled,
                    &mut summary,
                    &mut progress,
                )?;
            } else if is_archive(&ext) {
                import_archive(
                    db,
                    &library_root,
                    &mut folder_cache,
                    &mut batch,
                    &path,
                    target_folder,
                    Path::new(""),
                    0,
                    cancelled,
                    &mut summary,
                    &mut progress,
                )?;
            } else {
                import_file(
                    db,
                    &library_root,
                    &mut folder_cache,
                    &mut batch,
                    &path,
                    target_folder,
                    Path::new(""),
                    None,
                    true,
                    &mut summary,
                )?;
                progress.tick(file_name_of(&path));
            }
            if cancelled.load(Ordering::SeqCst) {
                summary.cancelled = true;
                break;
            }
        }
        Ok(())
    })();
    if let Err(err) = import_result {
        batch.rollback(db);
        remove_empty_created_dirs(&library_root, &folder_cache.created);
        return Err(err);
    }
    if let Err(err) = prune_created_empty_folders(db, &library_root, &folder_cache.created) {
        batch.rollback(db);
        remove_empty_created_dirs(&library_root, &folder_cache.created);
        return Err(err);
    }
    if batch.finish(db).is_err() {
        batch.rollback(db);
        return Err("Import batch commit failed.".into());
    }
    summary.pending_hash_count = db.count_unhashed()? as u32;
    progress.current = progress.total.max(progress.current);
    progress.flush();
    progress.emit(if summary.cancelled {
        "Import stopped"
    } else {
        "Import finished"
    });
    Ok(summary)
}

fn count_jobs(jobs: &[PathBuf], cancelled: &AtomicBool) -> Result<u32, String> {
    let mut total = 0u32;
    for path in jobs {
        if cancelled.load(Ordering::SeqCst) {
            return Ok(total);
        }
        if path.is_dir() {
            for entry in WalkDir::new(path).follow_links(false) {
                if cancelled.load(Ordering::SeqCst) {
                    return Ok(total);
                }
                if entry
                    .ok()
                    .map(|e| e.file_type().is_file())
                    .unwrap_or(false)
                {
                    total += 1;
                }
            }
        } else {
            total += 1;
        }
    }
    Ok(total)
}

fn join_rel(prefix: &Path, rel: &Path) -> PathBuf {
    if prefix.as_os_str().is_empty() {
        rel.to_path_buf()
    } else if rel.as_os_str().is_empty() {
        prefix.to_path_buf()
    } else {
        prefix.join(rel)
    }
}

fn import_tree<F: FnMut(ImportProgress)>(
    db: &mut AppDb,
    library_root: &Path,
    folder_cache: &mut FolderCache,
    batch: &mut ImportBatch,
    source_root: &Path,
    target_folder: Option<i64>,
    rel_prefix: &Path,
    source_archive: Option<&str>,
    archive_depth: u8,
    cancelled: &AtomicBool,
    summary: &mut ImportOutcome,
    progress: &mut ImportProgressCtx<F>,
) -> Result<(), String> {
    for entry in WalkDir::new(source_root).follow_links(false) {
        if cancelled.load(Ordering::SeqCst) {
            summary.cancelled = true;
            return Ok(());
        }
        let entry = match entry {
            Ok(entry) => entry,
            Err(err) => {
                summary.failed.push(err.to_string());
                continue;
            }
        };
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let ext = extension_of(&path.file_name().unwrap_or_default().to_string_lossy());
        let rel_parent = path
            .parent()
            .unwrap_or(source_root)
            .strip_prefix(source_root)
            .unwrap_or(Path::new(""))
            .to_path_buf();
        let relative_dir = join_rel(rel_prefix, &rel_parent);
        if is_archive(&ext) {
            if archive_depth < 1 {
                import_archive(
                    db,
                    library_root,
                    folder_cache,
                    batch,
                    path,
                    target_folder,
                    &relative_dir,
                    archive_depth + 1,
                    cancelled,
                    summary,
                    progress,
                )?;
            } else {
                summary.unsupported_count += 1;
                progress.tick(file_name_of(path));
            }
            continue;
        }
        import_file(
            db,
            library_root,
            folder_cache,
            batch,
            path,
            target_folder,
            &relative_dir,
            source_archive,
            source_archive.is_none(),
            summary,
        )?;
        progress.tick(file_name_of(path));
    }
    Ok(())
}


fn path_within(path: &Path, root: &Path) -> bool {
    let Ok(path) = path.canonicalize() else {
        return false;
    };
    let Ok(root) = root.canonicalize() else {
        return false;
    };
    path.starts_with(root)
}
