#[tauri::command]
async fn set_downloads_folder(app: AppHandle, path: Option<String>) -> Result<Settings, String> {
    let db = app.state::<AppState>().db.clone();
    off_ui("set_downloads_folder", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        crate::downloads::set_downloads_folder(&db, path)
    })
    .await
}

#[tauri::command]
async fn list_downloads(app: AppHandle) -> Result<crate::downloads::ListDownloadsResult, String> {
    let db = app.state::<AppState>().db.clone();
    off_ui("list_downloads", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        crate::downloads::list_downloads(&db)
    })
    .await
}

#[tauri::command]
async fn reveal_path(app: AppHandle, path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.opener()
            .reveal_item_in_dir(PathBuf::from(path).as_path())
            .map_err(|err| err.to_string())
    })
    .await
    .map_err(|err| err.to_string())?
}
