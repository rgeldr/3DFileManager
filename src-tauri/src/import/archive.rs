fn import_archive<F: FnMut(ImportProgress)>(
    db: &mut AppDb,
    library_root: &Path,
    folder_cache: &mut FolderCache,
    batch: &mut ImportBatch,
    archive_path: &Path,
    target_folder: Option<i64>,
    parent_rel: &Path,
    depth: u8,
    cancelled: &AtomicBool,
    summary: &mut ImportOutcome,
    progress: &mut ImportProgressCtx<F>,
) -> Result<(), String> {
    let stem = archive_path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "archive".into());
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let temp = db
        .data_dir
        .join("tmp-import")
        .join(format!("{}-{}", std::process::id(), stamp));
    let _ = fs::remove_dir_all(&temp);
    fs::create_dir_all(&temp).map_err(|e| e.to_string())?;
    let extract_result = extract_any(archive_path, &temp);
    if let Err(err) = extract_result {
        summary.failed.push(format!(
            "{}: {err}",
            archive_path.display()
        ));
        let _ = fs::remove_dir_all(&temp);
        progress.tick(file_name_of(archive_path));
        return Ok(());
    }
    progress.adjust_total_for_archive_contents(count_files_in_dir(&temp));
    let before_failed = summary.failed.len();
    let before_imported = summary.imported_count;
    let before_dup = summary.duplicate_count;
    let archive_name = archive_path
        .file_name()
        .map(|s| s.to_string_lossy().to_string());
    // The archive folder is created only when a file inside it is stored.
    let prefix = join_rel(parent_rel, Path::new(&stem));
    import_tree(
        db,
        library_root,
        folder_cache,
        batch,
        &temp,
        target_folder,
        &prefix,
        archive_name.as_deref(),
        depth,
        cancelled,
        summary,
        progress,
    )?;
    let _ = fs::remove_dir_all(&temp);
    let imported_something =
        summary.imported_count > before_imported || summary.duplicate_count > before_dup;
    // The archive file is the original. Extracted files live in a temp directory
    // and are not listed. A failed extract, or any new failure while importing
    // the contents, leaves the archive where it is.
    if summary.failed.len() == before_failed && imported_something {
        summary
            .recycle_paths
            .push(archive_path.to_string_lossy().to_string());
    }
    Ok(())
}

fn extract_any(archive: &Path, dest: &Path) -> Result<(), String> {
    let ext = extension_of(&archive.file_name().unwrap_or_default().to_string_lossy());
    match ext.as_str() {
        "zip" => extract_zip(archive, dest),
        "7z" => sevenz_rust::decompress_file(archive, dest).map_err(|e| e.to_string()),
        "rar" => extract_rar(archive, dest),
        other => Err(format!("Unsupported archive .{other}")),
    }
}

fn extract_zip(archive: &Path, dest: &Path) -> Result<(), String> {
    let file = File::open(archive).map_err(|e| e.to_string())?;
    let mut zip = ZipArchive::new(file).map_err(|e| e.to_string())?;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        let Some(rel) = entry.enclosed_name().map(|p| p.to_path_buf()) else {
            continue;
        };
        let out = dest.join(rel);
        if entry.is_dir() {
            fs::create_dir_all(&out).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(parent) = out.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut outfile = File::create(&out).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut outfile).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn extract_rar(archive_path: &Path, dest: &Path) -> Result<(), String> {
    let mut archive = unrar::Archive::new(archive_path)
        .open_for_processing()
        .map_err(|e| e.to_string())?;
    loop {
        let Some(header) = archive.read_header().map_err(|e| e.to_string())? else {
            break;
        };
        archive = header.extract_with_base(dest).map_err(|e| e.to_string())?;
    }
    Ok(())
}
