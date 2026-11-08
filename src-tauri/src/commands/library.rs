pub(crate) fn library_stats_work(db: &AppDb) -> Result<db::LibraryStats, String> {
    db.library_stats()
}

pub(crate) fn bootstrap_work(db: &AppDb) -> Result<db::Bootstrap, String> {
    db.bootstrap()
}

pub(crate) fn set_library_root_work(db: &AppDb, path: &std::path::Path) -> Result<db::Bootstrap, String> {
    db.set_library_root(path)
}

pub(crate) fn add_library_folder(
    db: &AppDb,
    parent_id: Option<i64>,
    name: &str,
) -> Result<db::FolderRow, String> {
    db.create_folder(parent_id, name, 0)
}

pub(crate) fn create_folder_work(
    db: &AppDb,
    parent_id: Option<i64>,
    name: &str,
) -> Result<db::FolderRow, String> {
    add_library_folder(db, parent_id, name)
}

pub(crate) fn restore_library_backup_work(
    db: &mut AppDb,
    thumbs: &mut AppDb,
    backup_path: &std::path::Path,
    library_path: &std::path::Path,
    cancel: &AtomicBool,
    progress: impl FnMut(relocate::DiskProgress),
) -> Result<bool, String> {
    backup::restore_library(db, thumbs, backup_path, library_path, cancel, progress)
}

pub(crate) fn rescan_library_work(
    db: &AppDb,
    cancel: &AtomicBool,
    progress: impl FnMut(relocate::DiskProgress),
) -> Result<rescan::RescanSummary, String> {
    rescan::rescan_with(db, cancel, None, progress)
}

pub(crate) fn rescan_folder_work(
    db: &AppDb,
    folder_id: i64,
    cancel: &AtomicBool,
    progress: impl FnMut(relocate::DiskProgress),
) -> Result<rescan::RescanSummary, String> {
    let rel = db.folder_relpath(folder_id)?;
    rescan::rescan_with(db, cancel, Some(&rel), progress)
}

pub(crate) fn delete_folder_work(db: &AppDb, id: i64) -> Result<(), String> {
    db.delete_folder(id)
}

pub(crate) fn rename_folder_work(
    db: &AppDb,
    id: i64,
    name: &str,
    cancel: &AtomicBool,
    progress: impl FnMut(relocate::DiskProgress),
) -> Result<bool, String> {
    db.rename_folder_with(id, name, cancel, progress)
}

pub(crate) fn move_folder_work(
    db: &AppDb,
    id: i64,
    parent_id: Option<i64>,
    cancel: &AtomicBool,
    progress: impl FnMut(relocate::DiskProgress),
) -> Result<bool, String> {
    db.move_folder_with(id, parent_id, cancel, false, progress)
}

pub(crate) fn move_library_root_work(
    db: &AppDb,
    path: &std::path::Path,
    cancel: &AtomicBool,
    progress: impl FnMut(relocate::DiskProgress),
) -> Result<bool, String> {
    db.move_library_root(path, cancel, progress)
}

pub(crate) fn export_library_backup_work(
    db: &AppDb,
    path: &std::path::Path,
    cancel: &AtomicBool,
    progress: impl FnMut(relocate::DiskProgress),
) -> Result<bool, String> {
    backup::export_library(db, path, cancel, progress)
}

pub(crate) fn catalog_asset_scope_paths(
    data_dir: &std::path::Path,
    library_root: Option<&str>,
) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(root) = library_root {
        paths.push(PathBuf::from(root));
    }
    paths.push(data_dir.join("thumbs"));
    paths
}

pub(crate) fn asset_scope_paths_after_set_library_root(
    boot: &db::Bootstrap,
    data_dir: &std::path::Path,
) -> Vec<PathBuf> {
    catalog_asset_scope_paths(data_dir, boot.settings.library_root.as_deref())
}

/// Same paths `restore_library_backup` used to scope: the stored library root
/// when one is set, then the thumbnail directory. A missing root is skipped.
/// The `PathBuf` from `library_root` is kept as-is so `\\?\` handling stays
/// inside `allow_asset_scope`'s canonicalize.
pub(crate) fn asset_scope_paths_after_uncancelled_job(db: &AppDb) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Ok(root) = db.library_root() {
        paths.push(root);
    }
    paths.push(db.data_dir.join("thumbs"));
    paths
}

pub(crate) fn asset_scope_library_root_path(db: &AppDb) -> Result<PathBuf, String> {
    db.library_root()
}

#[tauri::command]
async fn library_stats(app: AppHandle) -> Result<db::LibraryStats, String> {
    let db = app.state::<AppState>().db.clone();
    off_ui("library_stats", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        library_stats_work(&db)
    })
    .await
}

#[tauri::command]
async fn bootstrap(app: AppHandle) -> Result<db::Bootstrap, String> {
    let db = app.state::<AppState>().db.clone();
    off_ui("bootstrap", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        bootstrap_work(&db)
    })
    .await
}

#[tauri::command]
async fn set_library_root(
    app: AppHandle,
    window: WebviewWindow,
    path: String,
) -> Result<db::Bootstrap, String> {
    let source = window.label().to_string();
    let db = app.state::<AppState>().db.clone();
    let scope_app = app.clone();
    let result = off_ui("set_library_root", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        let result = set_library_root_work(&db, PathBuf::from(path).as_path())?;
        for scope_path in asset_scope_paths_after_set_library_root(&result, &db.data_dir) {
            allow_asset_scope(&scope_app, &scope_path);
        }
        Ok(result)
    })
    .await?;
    emit_library_changed(&app, LibraryChangeKind::All, &source);
    Ok(result)
}

#[tauri::command]
async fn create_folder(
    app: AppHandle,
    window: WebviewWindow,
    parent_id: Option<i64>,
    name: String,
) -> Result<db::FolderRow, String> {
    let source = window.label().to_string();
    let db = app.state::<AppState>().db.clone();
    let row = off_ui("create_folder", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        create_folder_work(&db, parent_id, &name)
    })
    .await?;
    emit_library_changed(&app, LibraryChangeKind::Folders, &source);
    Ok(row)
}

#[tauri::command]
async fn rename_folder(
    app: AppHandle,
    window: WebviewWindow,
    id: i64,
    name: String,
) -> Result<DiskOutcome, String> {
    let source = window.label().to_string();
    let _timer = CommandTimer::start("rename_folder");
    let result = block_on_disk(&app, move |db, cancel, app| {
        let cancelled = rename_folder_work(db, id, &name, cancel, |progress| emit_disk(&app, &progress))?;
        Ok::<DiskOutcome, String>(DiskOutcome { cancelled })
    })
    .await?;
    emit_library_changed(&app, LibraryChangeKind::Folders, &source);
    Ok(result)
}

#[tauri::command]
async fn delete_folder(app: AppHandle, window: WebviewWindow, id: i64) -> Result<DiskOutcome, String> {
    let source = window.label().to_string();
    let _timer = CommandTimer::start("delete_folder");
    let result = block_on_disk(&app, move |db, _cancel, _app| {
        delete_folder_work(db, id)?;
        Ok(DiskOutcome { cancelled: false })
    })
    .await?;
    emit_library_changed(&app, LibraryChangeKind::All, &source);
    Ok(result)
}

#[tauri::command]
async fn move_folder(
    app: AppHandle,
    window: WebviewWindow,
    id: i64,
    parent_id: Option<i64>,
) -> Result<DiskOutcome, String> {
    let source = window.label().to_string();
    let _timer = CommandTimer::start("move_folder");
    let result = block_on_disk(&app, move |db, cancel, app| {
        let cancelled = move_folder_work(db, id, parent_id, cancel, |progress| emit_disk(&app, &progress))?;
        Ok::<DiskOutcome, String>(DiskOutcome { cancelled })
    })
    .await?;
    emit_library_changed(&app, LibraryChangeKind::Folders, &source);
    Ok(result)
}

#[tauri::command]
async fn rescan_library(app: AppHandle, window: WebviewWindow) -> Result<rescan::RescanSummary, String> {
    let source = window.label().to_string();
    let _timer = CommandTimer::start("rescan_library");
    let result = block_on_disk(&app, move |db, cancel, handle| {
        rescan_library_work(db, cancel, |progress| emit_disk(&handle, &progress))
    })
    .await?;
    emit_library_changed(&app, LibraryChangeKind::All, &source);
    Ok(result)
}

#[tauri::command]
async fn rescan_folder(
    app: AppHandle,
    window: WebviewWindow,
    folder_id: i64,
) -> Result<rescan::RescanSummary, String> {
    let source = window.label().to_string();
    let _timer = CommandTimer::start("rescan_folder");
    let result = block_on_disk(&app, move |db, cancel, handle| {
        rescan_folder_work(db, folder_id, cancel, |progress| emit_disk(&handle, &progress))
    })
    .await?;
    emit_library_changed(&app, LibraryChangeKind::All, &source);
    Ok(result)
}

#[tauri::command]
async fn move_library_root(app: AppHandle, window: WebviewWindow, path: String) -> Result<DiskOutcome, String> {
    let source = window.label().to_string();
    let _timer = CommandTimer::start("move_library_root");
    let scope_app = app.clone();
    let result = block_on_disk(&app, move |db, cancel, handle| {
        let cancelled = move_library_root_work(db, PathBuf::from(path).as_path(), cancel, |progress| {
            emit_disk(&handle, &progress)
        })?;
        if !cancelled {
            if let Ok(root) = asset_scope_library_root_path(db) {
                allow_asset_scope(&scope_app, &root);
            }
        }
        Ok::<DiskOutcome, String>(DiskOutcome { cancelled })
    })
    .await?;
    emit_library_changed(&app, LibraryChangeKind::All, &source);
    Ok(result)
}

#[tauri::command]
async fn export_library_backup(app: AppHandle, path: String) -> Result<DiskOutcome, String> {
    let _timer = CommandTimer::start("export_library_backup");
    block_on_disk(&app, move |db, cancel, handle| {
        let cancelled = export_library_backup_work(db, PathBuf::from(path).as_path(), cancel, |progress| {
            emit_disk(&handle, &progress)
        })?;
        Ok::<DiskOutcome, String>(DiskOutcome { cancelled })
    })
    .await
}

#[tauri::command]
async fn restore_library_backup(
    app: AppHandle,
    window: WebviewWindow,
    backup_path: String,
    library_path: String,
) -> Result<DiskOutcome, String> {
    let source = window.label().to_string();
    let _timer = CommandTimer::start("restore_library_backup");
    let _guard = acquire_disk(&app)?;
    let cancel = app.state::<AppState>().disk_cancel.clone();
    let db = app.state::<AppState>().db.clone();
    let thumbs = app.state::<AppState>().thumbs.clone();
    let scope_app = app.clone();
    let worker = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let mut db = db.lock().map_err(|e| e.to_string())?;
        let mut thumbs = thumbs.lock().map_err(|e| e.to_string())?;
        let cancelled = restore_library_backup_work(
            &mut db,
            &mut thumbs,
            PathBuf::from(backup_path).as_path(),
            PathBuf::from(library_path).as_path(),
            &cancel,
            |progress| emit_disk(&worker, &progress),
        )?;
        if !cancelled {
            for scope_path in asset_scope_paths_after_uncancelled_job(&db) {
                allow_asset_scope(&scope_app, &scope_path);
            }
        }
        Ok::<DiskOutcome, String>(DiskOutcome { cancelled })
    })
    .await
    .map_err(|err| err.to_string())??;
    emit_library_changed(&app, LibraryChangeKind::All, &source);
    Ok(result)
}
