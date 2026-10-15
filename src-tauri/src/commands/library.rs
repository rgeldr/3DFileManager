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
        rescan::rescan_with(db, cancel, |progress| emit_disk(&handle, &progress))
    })
    .await
}
