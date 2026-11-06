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

pub(crate) fn apply_theme(db: &AppDb, theme: String) -> Result<(), String> {
    validate_theme(&theme)?;
    let mut settings = db.settings();
    settings.theme = theme;
    db.save_settings(&settings)
}

pub(crate) fn apply_grid_size(db: &AppDb, grid_size: String) -> Result<(), String> {
    validate_grid_size(&grid_size)?;
    let mut settings = db.settings();
    settings.grid_size = grid_size;
    db.save_settings(&settings)
}

pub(crate) fn apply_search_scope(db: &AppDb, search_scope: String) -> Result<(), String> {
    validate_search_scope(&search_scope)?;
    let mut settings = db.settings();
    settings.search_scope = search_scope;
    db.save_settings(&settings)
}

pub(crate) fn get_settings_work(db: &AppDb) -> Settings {
    db.settings()
}

#[tauri::command]
async fn set_theme(app: AppHandle, window: WebviewWindow, theme: String) -> Result<(), String> {
    let source = window.label().to_string();
    let db = app.state::<AppState>().db.clone();
    off_ui("set_theme", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        apply_theme(&db, theme)
    })
    .await?;
    emit_library_changed(&app, LibraryChangeKind::Settings, &source);
    Ok(())
}

#[tauri::command]
async fn set_grid_size(app: AppHandle, window: WebviewWindow, grid_size: String) -> Result<(), String> {
    let source = window.label().to_string();
    let db = app.state::<AppState>().db.clone();
    off_ui("set_grid_size", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        apply_grid_size(&db, grid_size)
    })
    .await?;
    emit_library_changed(&app, LibraryChangeKind::Settings, &source);
    Ok(())
}

pub(crate) fn store_pane_widths(db: &AppDb, sidebar_width: u32, inspector_width: u32) -> Result<(), String> {
    db.set_pane_widths(sidebar_width, inspector_width)
}

pub(crate) fn store_details_columns(db: &AppDb, columns: settings::DetailsColumns) -> Result<(), String> {
    db.set_details_columns(columns)
}

pub(crate) fn store_preview_height(db: &AppDb, preview_height: u32) -> Result<(), String> {
    db.set_preview_height(preview_height)
}

pub(crate) fn store_inspector_pinned(db: &AppDb, inspector_pinned: bool) -> Result<(), String> {
    db.set_inspector_pinned(inspector_pinned)
}

pub(crate) fn store_sidebar_pinned(db: &AppDb, sidebar_pinned: bool) -> Result<(), String> {
    db.set_sidebar_pinned(sidebar_pinned)
}

#[tauri::command]
async fn set_pane_widths(
    app: AppHandle,
    window: WebviewWindow,
    sidebar_width: u32,
    inspector_width: u32,
) -> Result<(), String> {
    let source = window.label().to_string();
    let db = app.state::<AppState>().db.clone();
    off_ui("set_pane_widths", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        store_pane_widths(&db, sidebar_width, inspector_width)
    })
    .await?;
    emit_library_changed(&app, LibraryChangeKind::Settings, &source);
    Ok(())
}

#[tauri::command]
async fn set_details_columns(
    app: AppHandle,
    window: WebviewWindow,
    columns: settings::DetailsColumns,
) -> Result<(), String> {
    let source = window.label().to_string();
    let db = app.state::<AppState>().db.clone();
    off_ui("set_details_columns", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        store_details_columns(&db, columns)
    })
    .await?;
    emit_library_changed(&app, LibraryChangeKind::Settings, &source);
    Ok(())
}

#[tauri::command]
async fn set_preview_height(app: AppHandle, window: WebviewWindow, preview_height: u32) -> Result<(), String> {
    let source = window.label().to_string();
    let db = app.state::<AppState>().db.clone();
    off_ui("set_preview_height", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        store_preview_height(&db, preview_height)
    })
    .await?;
    emit_library_changed(&app, LibraryChangeKind::Settings, &source);
    Ok(())
}

#[tauri::command]
async fn set_inspector_pinned(app: AppHandle, window: WebviewWindow, inspector_pinned: bool) -> Result<(), String> {
    let source = window.label().to_string();
    let db = app.state::<AppState>().db.clone();
    off_ui("set_inspector_pinned", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        store_inspector_pinned(&db, inspector_pinned)
    })
    .await?;
    emit_library_changed(&app, LibraryChangeKind::Settings, &source);
    Ok(())
}

#[tauri::command]
async fn set_sidebar_pinned(app: AppHandle, window: WebviewWindow, sidebar_pinned: bool) -> Result<(), String> {
    let source = window.label().to_string();
    let db = app.state::<AppState>().db.clone();
    off_ui("set_sidebar_pinned", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        store_sidebar_pinned(&db, sidebar_pinned)
    })
    .await?;
    emit_library_changed(&app, LibraryChangeKind::Settings, &source);
    Ok(())
}

#[tauri::command]
async fn set_search_scope(app: AppHandle, window: WebviewWindow, search_scope: String) -> Result<(), String> {
    let source = window.label().to_string();
    let db = app.state::<AppState>().db.clone();
    off_ui("set_search_scope", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        apply_search_scope(&db, search_scope)
    })
    .await?;
    emit_library_changed(&app, LibraryChangeKind::Settings, &source);
    Ok(())
}

pub(crate) fn save_external_programs(
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
    window: WebviewWindow,
    programs: Vec<crate::external_programs::ExternalProgram>,
) -> Result<(), String> {
    let source = window.label().to_string();
    let db = app.state::<AppState>().db.clone();
    off_ui("set_external_programs", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        save_external_programs(&db, programs)
    })
    .await?;
    emit_library_changed(&app, LibraryChangeKind::Settings, &source);
    Ok(())
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
        Ok(get_settings_work(&db))
    })
    .await
}
