struct ImportBatch {
    active: bool,
    inserts: u32,
}

impl ImportBatch {
    fn begin(db: &mut AppDb) -> Result<Self, String> {
        db.import_batch_begin()?;
        Ok(Self {
            active: true,
            inserts: 0,
        })
    }

    fn note_insert(&mut self, db: &mut AppDb) -> Result<(), String> {
        self.inserts += 1;
        if self.inserts >= BATCH_SIZE {
            self.commit(db)?;
            db.import_batch_begin()?;
            self.active = true;
            self.inserts = 0;
        }
        Ok(())
    }

    fn commit(&mut self, db: &mut AppDb) -> Result<(), String> {
        if self.active {
            db.import_batch_commit()?;
            self.active = false;
            self.inserts = 0;
        }
        Ok(())
    }

    fn rollback(&mut self, db: &mut AppDb) {
        if self.active {
            let _ = db.import_batch_rollback();
            self.active = false;
            self.inserts = 0;
        }
    }

    fn finish(&mut self, db: &mut AppDb) -> Result<(), String> {
        self.commit(db)
    }
}

#[cfg(test)]
thread_local! {
    pub(crate) static FORCE_COPY: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
}

fn force_copy_enabled() -> bool {
    #[cfg(test)]
    {
        FORCE_COPY.get()
    }
    #[cfg(not(test))]
    {
        false
    }
}

fn import_file(
    db: &mut AppDb,
    library_root: &Path,
    folder_cache: &mut FolderCache,
    batch: &mut ImportBatch,
    source: &Path,
    parent_folder: Option<i64>,
    relative_dir: &Path,
    source_archive: Option<&str>,
    can_recycle: bool,
    summary: &mut ImportOutcome,
) -> Result<(), String> {
    let file_name = source
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".into());
    let ext = extension_of(&file_name);
    if !is_supported_file(&ext) {
        summary.unsupported_count += 1;
        return Ok(());
    }

    let force_copy = force_copy_enabled();
    // Hash before creating folders when the file will be copied. A duplicate
    // then never creates its destination folder. Hard links still need the
    // destination directory first; an empty folder from a failed link is
    // removed by prune_created_empty_folders.
    if force_copy {
        let sha = match hash_file(source) {
            Ok(sha) => sha,
            Err(err) => {
                summary.failed.push(format!("{}: {err}", source.display()));
                return Ok(());
            }
        };
        if db.sha_exists(&sha)? {
            summary.duplicate_count += 1;
            remember_recycle(summary, source, can_recycle);
            return Ok(());
        }
        let folder_id =
            folder_cache.ensure_folder_chain(db, library_root, parent_folder, relative_dir)?;
        return store_copied_file(
            db,
            library_root,
            folder_cache,
            batch,
            source,
            folder_id,
            &file_name,
            &ext,
            &sha,
            source_archive,
            can_recycle,
            summary,
        );
    }

    let folder_id =
        folder_cache.ensure_folder_chain(db, library_root, parent_folder, relative_dir)?;
    let dest_dir = folder_cache.dest_dir(library_root, folder_id)?;
    fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
    let dest = unique_file_path(&dest_dir, &file_name);
    let linked = fs::hard_link(source, &dest).is_ok();

    if linked {
        let meta = dest.metadata().map_err(|e| e.to_string())?;
        let rel = dest
            .strip_prefix(library_root)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        let mtime = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        match db.insert_file_with_thumb_status(
            &file_name,
            &rel,
            &ext,
            meta.len() as i64,
            "",
            mtime,
            folder_id,
            source_archive,
            "unhashed",
        ) {
            Ok(id) => {
                batch.note_insert(db)?;
                summary.imported_ids.push(id);
                summary.imported_count += 1;
                remember_recycle(summary, source, can_recycle);
            }
            Err(err) => {
                let _ = fs::remove_file(&dest);
                summary.failed.push(format!("{file_name}: {err}"));
            }
        }
        return Ok(());
    }

    let sha = match hash_file(source) {
        Ok(sha) => sha,
        Err(err) => {
            summary.failed.push(format!("{}: {err}", source.display()));
            return Ok(());
        }
    };
    if db.sha_exists(&sha)? {
        summary.duplicate_count += 1;
        remember_recycle(summary, source, can_recycle);
        return Ok(());
    }
    store_copied_file(
        db,
        library_root,
        folder_cache,
        batch,
        source,
        folder_id,
        &file_name,
        &ext,
        &sha,
        source_archive,
        can_recycle,
        summary,
    )
}

fn store_copied_file(
    db: &mut AppDb,
    library_root: &Path,
    folder_cache: &mut FolderCache,
    batch: &mut ImportBatch,
    source: &Path,
    folder_id: Option<i64>,
    file_name: &str,
    ext: &str,
    sha: &str,
    source_archive: Option<&str>,
    can_recycle: bool,
    summary: &mut ImportOutcome,
) -> Result<(), String> {
    let dest_dir = folder_cache.dest_dir(library_root, folder_id)?;
    fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
    let dest = unique_file_path(&dest_dir, file_name);
    if let Err(err) = fs::copy(source, &dest) {
        summary
            .failed
            .push(format!("{}: {err}", source.display()));
        return Ok(());
    }
    let meta = match dest.metadata() {
        Ok(meta) => meta,
        Err(err) => {
            summary.failed.push(err.to_string());
            return Ok(());
        }
    };
    let rel = dest
        .strip_prefix(library_root)
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .replace('\\', "/");
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    match db.insert_file(
        file_name,
        &rel,
        ext,
        meta.len() as i64,
        sha,
        mtime,
        folder_id,
        source_archive,
    ) {
        Ok(id) => {
            batch.note_insert(db)?;
            summary.imported_ids.push(id);
            summary.imported_count += 1;
            remember_recycle(summary, source, can_recycle);
        }
        Err(err) => {
            let _ = fs::remove_file(&dest);
            summary.failed.push(format!("{file_name}: {err}"));
        }
    }
    Ok(())
}

fn remember_recycle(summary: &mut ImportOutcome, source: &Path, can_recycle: bool) {
    if can_recycle {
        summary
            .recycle_paths
            .push(source.to_string_lossy().to_string());
    }
}

fn count_files_in_dir(source_root: &Path) -> u32 {
    let mut count = 0u32;
    for entry in WalkDir::new(source_root).follow_links(false) {
        if entry
            .ok()
            .map(|e| e.file_type().is_file())
            .unwrap_or(false)
        {
            count += 1;
        }
    }
    count
}

fn file_name_of(path: &Path) -> String {
    path.file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| path.display().to_string())
}

pub fn hash_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 1024 * 64];
    loop {
        let n = file.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}
