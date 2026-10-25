#[tauri::command]
async fn library_stats(app: AppHandle) -> Result<db::LibraryStats, String> {
    let db = app.state::<AppState>().db.clone();
    off_ui("library_stats", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        db.library_stats()
    })
    .await
}

#[tauri::command]
async fn bootstrap(app: AppHandle) -> Result<db::Bootstrap, String> {
    let db = app.state::<AppState>().db.clone();
    off_ui("bootstrap", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        db.bootstrap()
    })
    .await
}

#[tauri::command]
async fn set_library_root(app: AppHandle, path: String) -> Result<db::Bootstrap, String> {
    let db = app.state::<AppState>().db.clone();
    let scope_app = app.clone();
    off_ui("set_library_root", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        let result = db.set_library_root(PathBuf::from(path).as_path())?;
        if let Some(root) = &result.settings.library_root {
            allow_asset_scope(&scope_app, PathBuf::from(root).as_path());
        }
        allow_asset_scope(&scope_app, &db.data_dir.join("thumbs"));
        Ok(result)
    })
    .await
}

#[tauri::command]
async fn create_folder(app: AppHandle, parent_id: Option<i64>, name: String) -> Result<db::FolderRow, String> {
    let db = app.state::<AppState>().db.clone();
    off_ui("create_folder", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        db.create_folder(parent_id, &name, 0)
    })
    .await
}

#[tauri::command]
async fn rename_folder(app: AppHandle, id: i64, name: String) -> Result<DiskOutcome, String> {
    let _timer = CommandTimer::start("rename_folder");
    block_on_disk(app, move |db, cancel, app| {
        let cancelled = db.rename_folder_with(id, &name, cancel, |progress| emit_disk(&app, &progress))?;
        Ok(DiskOutcome { cancelled })
    })
    .await
}

#[tauri::command]
async fn delete_folder(app: AppHandle, id: i64) -> Result<DiskOutcome, String> {
    let _timer = CommandTimer::start("delete_folder");
    block_on_disk(app, move |db, _cancel, _app| {
        db.delete_folder(id)?;
        Ok(DiskOutcome { cancelled: false })
    })
    .await
}

#[tauri::command]
async fn move_folder(app: AppHandle, id: i64, parent_id: Option<i64>) -> Result<DiskOutcome, String> {
    let _timer = CommandTimer::start("move_folder");
    block_on_disk(app, move |db, cancel, app| {
        let cancelled = db.move_folder_with(id, parent_id, cancel, false, |progress| {
            emit_disk(&app, &progress)
        })?;
        Ok(DiskOutcome { cancelled })
    })
    .await
}

#[tauri::command]
async fn rescan_library(app: AppHandle) -> Result<rescan::RescanSummary, String> {
    let _timer = CommandTimer::start("rescan_library");
    block_on_disk(app, move |db, cancel, handle| {
        rescan::rescan_with(db, cancel, None, |progress| emit_disk(&handle, &progress))
    })
    .await
}

#[tauri::command]
async fn rescan_folder(app: AppHandle, folder_id: i64) -> Result<rescan::RescanSummary, String> {
    let _timer = CommandTimer::start("rescan_folder");
    block_on_disk(app, move |db, cancel, handle| {
        let rel = db.folder_relpath(folder_id)?;
        rescan::rescan_with(db, cancel, Some(&rel), |progress| emit_disk(&handle, &progress))
    })
    .await
}

#[tauri::command]
async fn move_library_root(app: AppHandle, path: String) -> Result<DiskOutcome, String> {
    let _timer = CommandTimer::start("move_library_root");
    let scope_app = app.clone();
    block_on_disk(app, move |db, cancel, handle| {
        let cancelled = db.move_library_root(PathBuf::from(path).as_path(), cancel, |progress| {
            emit_disk(&handle, &progress)
        })?;
        if !cancelled {
            if let Ok(root) = db.library_root() {
                allow_asset_scope(&scope_app, &root);
            }
        }
        Ok(DiskOutcome { cancelled })
    })
    .await
}

#[tauri::command]
async fn export_library_backup(app: AppHandle, path: String) -> Result<DiskOutcome, String> {
    let _timer = CommandTimer::start("export_library_backup");
    block_on_disk(app, move |db, cancel, handle| {
        let cancelled = backup::export_library(db, PathBuf::from(path).as_path(), cancel, |progress| {
            emit_disk(&handle, &progress)
        })?;
        Ok(DiskOutcome { cancelled })
    })
    .await
}

#[tauri::command]
async fn restore_library_backup(
    app: AppHandle,
    backup_path: String,
    library_path: String,
) -> Result<DiskOutcome, String> {
    let _timer = CommandTimer::start("restore_library_backup");
    let _guard = acquire_disk(&app)?;
    let cancel = app.state::<AppState>().disk_cancel.clone();
    let db = app.state::<AppState>().db.clone();
    let thumbs = app.state::<AppState>().thumbs.clone();
    let scope_app = app.clone();
    let worker = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut db = db.lock().map_err(|e| e.to_string())?;
        let mut thumbs = thumbs.lock().map_err(|e| e.to_string())?;
        let cancelled = backup::restore_library(
            &mut db,
            &mut thumbs,
            PathBuf::from(backup_path).as_path(),
            PathBuf::from(library_path).as_path(),
            &cancel,
            |progress| emit_disk(&worker, &progress),
        )?;
        if !cancelled {
            if let Ok(root) = db.library_root() {
                allow_asset_scope(&scope_app, &root);
            }
            allow_asset_scope(&scope_app, &db.data_dir.join("thumbs"));
        }
        Ok(DiskOutcome { cancelled })
    })
    .await
    .map_err(|err| err.to_string())?
}
