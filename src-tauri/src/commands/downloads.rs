pub(crate) fn reveal_download_in_folder(db: &AppDb, path: &str) -> Result<std::path::PathBuf, String> {
    let saved = db
        .settings()
        .downloads_folder
        .ok_or_else(|| "Choose a Downloads folder first.".to_string())?;
    crate::downloads::allowed_reveal_target(std::path::Path::new(&saved), std::path::Path::new(path))
}

#[tauri::command]
async fn set_downloads_folder(
    app: AppHandle,
    window: WebviewWindow,
    path: Option<String>,
) -> Result<Settings, String> {
    let source = window.label().to_string();
    let db = app.state::<AppState>().db.clone();
    let settings = off_ui("set_downloads_folder", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        crate::downloads::set_downloads_folder(&db, path)
    })
    .await?;
    emit_library_changed(&app, LibraryChangeKind::Settings, &source);
    Ok(settings)
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
    let db = app.state::<AppState>().db.clone();
    let shown = off_ui("reveal_path", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        reveal_download_in_folder(&db, &path)
    })
    .await?;
    tauri::async_runtime::spawn_blocking(move || {
        app.opener()
            .reveal_item_in_dir(shown.as_path())
            .map_err(|err| err.to_string())
    })
    .await
    .map_err(|err| err.to_string())?
}
