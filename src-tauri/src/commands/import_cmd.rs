pub(crate) fn store_import_cancel(cancel: &AtomicBool) {
    cancel.store(true, Ordering::SeqCst);
}

pub(crate) fn store_disk_cancel(cancel: &AtomicBool) {
    request_disk_cancel(cancel);
}

pub(crate) fn record_import_recycle_targets(
    paths: &Mutex<Vec<String>>,
    roots: &Mutex<Vec<String>>,
    outcome: &import::ImportOutcome,
) {
    if let Ok(mut stored) = paths.lock() {
        *stored = outcome.recycle_paths.clone();
    }
    if let Ok(mut stored) = roots.lock() {
        *stored = outcome.recycle_roots.clone();
    }
}

#[tauri::command]
async fn import_paths(
    app: AppHandle,
    window: WebviewWindow,
    paths: Vec<String>,
    folder_id: Option<i64>,
) -> Result<import::ImportSummary, String> {
    let source = window.label().to_string();
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
    let state = app.state::<AppState>();
    record_import_recycle_targets(&state.last_recycle_paths, &state.last_recycle_roots, &outcome);
    hash_pass::spawn_hash_pass_if_needed(app.clone(), app.state::<AppState>().db.clone());
    emit_library_changed(&app, crate::library_events::LibraryChangeKind::All, &source);
    Ok(import::summary_for_api(&outcome))
}

#[tauri::command]
fn cancel_import(state: State<AppState>) {
    store_import_cancel(&state.import_cancel);
}

#[tauri::command]
fn cancel_disk_op(state: State<AppState>) {
    store_disk_cancel(&state.disk_cancel);
}
