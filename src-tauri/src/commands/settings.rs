#[tauri::command]
async fn set_theme(app: AppHandle, theme: String) -> Result<(), String> {
    let db = app.state::<AppState>().db.clone();
    off_ui("set_theme", move || {
        if theme != "dark" && theme != "light" {
            return Err("Unknown theme.".into());
        }
        let db = db.lock().map_err(|e| e.to_string())?;
        let mut settings = db.settings();
        settings.theme = theme;
        db.save_settings(&settings)
    })
    .await
}

#[tauri::command]
async fn set_grid_size(app: AppHandle, grid_size: String) -> Result<(), String> {
    let db = app.state::<AppState>().db.clone();
    off_ui("set_grid_size", move || {
        if !matches!(grid_size.as_str(), "medium" | "large" | "extraLarge") {
            return Err("Unknown grid size.".into());
        }
        let db = db.lock().map_err(|e| e.to_string())?;
        let mut settings = db.settings();
        settings.grid_size = grid_size;
        db.save_settings(&settings)
    })
    .await
}

#[tauri::command]
async fn set_pane_widths(app: AppHandle, sidebar_width: u32, inspector_width: u32) -> Result<(), String> {
    let db = app.state::<AppState>().db.clone();
    off_ui("set_pane_widths", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        db.set_pane_widths(sidebar_width, inspector_width)
    })
    .await
}

#[tauri::command]
async fn set_preview_height(app: AppHandle, preview_height: u32) -> Result<(), String> {
    let db = app.state::<AppState>().db.clone();
    off_ui("set_preview_height", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        db.set_preview_height(preview_height)
    })
    .await
}

#[tauri::command]
async fn set_inspector_pinned(app: AppHandle, inspector_pinned: bool) -> Result<(), String> {
    let db = app.state::<AppState>().db.clone();
    off_ui("set_inspector_pinned", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        db.set_inspector_pinned(inspector_pinned)
    })
    .await
}

#[tauri::command]
async fn get_settings(app: AppHandle) -> Result<Settings, String> {
    let db = app.state::<AppState>().db.clone();
    off_ui("get_settings", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        Ok(db.settings())
    })
    .await
}
