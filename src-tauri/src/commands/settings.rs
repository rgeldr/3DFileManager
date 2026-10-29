fn validate_theme(theme: &str) -> Result<(), String> {
    if theme != "dark" && theme != "light" {
        return Err("Unknown theme.".into());
    }
    Ok(())
}

fn validate_grid_size(grid_size: &str) -> Result<(), String> {
    if !matches!(
        grid_size,
        "medium" | "large" | "extraLarge" | "list" | "details"
    ) {
        return Err("Unknown grid size.".into());
    }
    Ok(())
}

fn validate_search_scope(search_scope: &str) -> Result<(), String> {
    if !matches!(search_scope, "library" | "folder") {
        return Err("Unknown search scope.".into());
    }
    Ok(())
}

#[tauri::command]
async fn set_theme(app: AppHandle, theme: String) -> Result<(), String> {
    let db = app.state::<AppState>().db.clone();
    off_ui("set_theme", move || {
        validate_theme(&theme)?;
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
        validate_grid_size(&grid_size)?;
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
async fn set_details_columns(app: AppHandle, columns: settings::DetailsColumns) -> Result<(), String> {
    let db = app.state::<AppState>().db.clone();
    off_ui("set_details_columns", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        db.set_details_columns(columns)
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
async fn set_sidebar_pinned(app: AppHandle, sidebar_pinned: bool) -> Result<(), String> {
    let db = app.state::<AppState>().db.clone();
    off_ui("set_sidebar_pinned", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        db.set_sidebar_pinned(sidebar_pinned)
    })
    .await
}

#[tauri::command]
async fn set_search_scope(app: AppHandle, search_scope: String) -> Result<(), String> {
    let db = app.state::<AppState>().db.clone();
    off_ui("set_search_scope", move || {
        validate_search_scope(&search_scope)?;
        let db = db.lock().map_err(|e| e.to_string())?;
        let mut settings = db.settings();
        settings.search_scope = search_scope;
        db.save_settings(&settings)
    })
    .await
}

fn save_external_programs(
    db: &AppDb,
    programs: Vec<crate::external_programs::ExternalProgram>,
) -> Result<(), String> {
    let programs = crate::external_programs::normalize_external_programs(programs)?;
    let mut settings = db.settings();
    settings.external_programs = programs;
    db.save_settings(&settings)
}

#[tauri::command]
async fn set_external_programs(
    app: AppHandle,
    programs: Vec<crate::external_programs::ExternalProgram>,
) -> Result<(), String> {
    let db = app.state::<AppState>().db.clone();
    off_ui("set_external_programs", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        save_external_programs(&db, programs)
    })
    .await
}

#[tauri::command]
async fn detect_external_programs() -> Result<Vec<crate::external_programs::ProgramSuggestion>, String> {
    off_ui("detect_external_programs", move || {
        Ok(crate::external_programs::detect_installed_programs())
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
