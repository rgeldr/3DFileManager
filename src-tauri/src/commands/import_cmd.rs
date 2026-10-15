#[tauri::command]
async fn import_paths(
    app: AppHandle,
    paths: Vec<String>,
    folder_id: Option<i64>,
) -> Result<import::ImportSummary, String> {
    let _timer = CommandTimer::start("import_paths");
    let _guard = acquire_disk(&app)?;
    let db = app.state::<AppState>().db.clone();
    let cancel = app.state::<AppState>().import_cancel.clone();
    cancel.store(false, Ordering::SeqCst);
    let emit_app = app.clone();
    let outcome = tauri::async_runtime::spawn_blocking(move || -> Result<import::ImportOutcome, String> {
        let mut db = db.lock().map_err(|e| e.to_string())?;
        let outcome = import::import_paths(&mut db, &paths, folder_id, &cancel, |progress| {
            let _ = emit_app.emit(
                "import-progress",
                serde_json::json!({
                    "current": progress.current,
                    "total": progress.total,
                    "message": progress.message,
                }),
            );
        })?;
        drop(db);
        Ok(outcome)
    })
    .await
    .map_err(|err| err.to_string())??;
    if let Ok(mut stored) = app.state::<AppState>().last_recycle_paths.lock() {
        *stored = outcome.recycle_paths.clone();
    }
    if let Ok(mut stored) = app.state::<AppState>().last_recycle_roots.lock() {
        *stored = outcome.recycle_roots.clone();
    }
    hash_pass::spawn_hash_pass_if_needed(app.clone(), app.state::<AppState>().db.clone());
    Ok(import::summary_for_api(&outcome))
}

#[tauri::command]
fn cancel_import(state: State<AppState>) {
    state.import_cancel.store(true, Ordering::SeqCst);
}

#[tauri::command]
fn cancel_disk_op(state: State<AppState>) {
    state.disk_cancel.store(true, Ordering::SeqCst);
}
