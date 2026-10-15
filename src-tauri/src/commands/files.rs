fn recycle_and_drop_files(
    db: &Mutex<AppDb>,
    items: &[db::TrashItem],
    cancel: &AtomicBool,
    mut progress: impl FnMut(relocate::DiskProgress),
    mut recycle: impl FnMut(&std::path::Path) -> Result<(), String>,
) -> Result<bool, String> {
    let total = items.len() as u32;
    for (index, item) in items.iter().enumerate() {
        if cancel.load(Ordering::SeqCst) {
            return Ok(true);
        }
        progress(relocate::DiskProgress {
            current: index as u32,
            total,
            name: item.name.clone(),
            bytes_done: 0,
            bytes_total: item.bytes,
            cancellable: true,
        });
        if item.path.exists() {
            recycle(&item.path)?;
        }
        {
            let db = db.lock().map_err(|err| err.to_string())?;
            if db.file_row_exists(item.id)? {
                db.remove_catalogued_file(item.id, &item.sha256)?;
            }
        }
        progress(relocate::DiskProgress {
            current: (index as u32) + 1,
            total,
            name: String::new(),
            bytes_done: item.bytes,
            bytes_total: item.bytes,
            cancellable: true,
        });
    }
    Ok(false)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListFilesArgs {
    folder: String,
    folder_id: Option<i64>,
    query: String,
    creator: String,
    tag: String,
    #[serde(default)]
    tag_ids: Vec<i64>,
    #[serde(default = "default_tag_match")]
    tag_match: String,
    sort: String,
    #[serde(default)]
    limit: Option<u32>,
    #[serde(default)]
    offset: u32,
}

fn default_tag_match() -> String {
    "any".into()
}

fn folder_filter(folder: &str, folder_id: Option<i64>) -> Result<FolderFilter, String> {
    match folder {
        "all" => Ok(FolderFilter::All),
        "root" => Ok(FolderFilter::Root),
        "id" => Ok(FolderFilter::Id(folder_id.ok_or("Missing folder id")?)),
        _ => Err("Unknown folder filter.".into()),
    }
}

fn tag_match_mode(mode: &str) -> Result<db::TagMatch, String> {
    match mode.to_ascii_lowercase().as_str() {
        "any" | "" => Ok(db::TagMatch::Any),
        "all" => Ok(db::TagMatch::All),
        _ => Err("Unknown tag match.".into()),
    }
}

#[tauri::command]
async fn list_files(app: AppHandle, args: ListFilesArgs) -> Result<Vec<db::FileRow>, String> {
    let db = app.state::<AppState>().db.clone();
    off_ui("list_files", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        let filter = folder_filter(&args.folder, args.folder_id)?;
        let tag_match = tag_match_mode(&args.tag_match)?;
        db.query_files(db::FileQuery {
            folder: filter,
            query: &args.query,
            creator: &args.creator,
            tag: &args.tag,
            tag_ids: &args.tag_ids,
            tag_match,
            sort: &args.sort,
            limit: args.limit,
            offset: args.offset,
        })
    })
    .await
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct TagCountArgs {
    folder: String,
    folder_id: Option<i64>,
    query: String,
    creator: String,
}

#[tauri::command]
async fn list_tag_counts(app: AppHandle, args: TagCountArgs) -> Result<Vec<db::TagCount>, String> {
    let db = app.state::<AppState>().db.clone();
    off_ui("list_tag_counts", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        let filter = folder_filter(&args.folder, args.folder_id)?;
        db.tag_counts(filter, &args.query, &args.creator)
    })
    .await
}

#[tauri::command]
async fn missing_files(app: AppHandle) -> Result<Vec<db::FileRow>, String> {
    let db = app.state::<AppState>().db.clone();
    off_ui("missing_files", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        db.missing_files()
    })
    .await
}

#[tauri::command]
async fn remove_missing(app: AppHandle) -> Result<(), String> {
    let db = app.state::<AppState>().db.clone();
    off_ui("remove_missing", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        db.remove_missing()
    })
    .await
}

#[tauri::command]
async fn update_file(
    app: AppHandle,
    id: i64,
    sort_name: String,
    creator: String,
    notes: String,
    folder_id: Option<i64>,
) -> Result<DiskOutcome, String> {
    let _timer = CommandTimer::start("update_file");
    block_on_disk(app, move |db, cancel, handle| {
        let cancelled = db.update_file_with(id, &sort_name, &creator, &notes, folder_id, cancel, |progress| {
            emit_disk(&handle, &progress)
        })?;
        Ok(DiskOutcome { cancelled })
    })
    .await
}

#[tauri::command]
async fn set_tags(app: AppHandle, id: i64, tags: Vec<String>) -> Result<(), String> {
    let db = app.state::<AppState>().db.clone();
    off_ui("set_tags", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        db.set_tags(id, &tags)
    })
    .await
}

#[tauri::command]
async fn add_tags_under_folder(
    app: AppHandle,
    folder_id: Option<i64>,
    tags: Vec<String>,
) -> Result<i64, String> {
    let db = app.state::<AppState>().db.clone();
    off_ui("add_tags_under_folder", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        db.add_tags_under_folder(folder_id, &tags)
    })
    .await
}

#[tauri::command]
async fn apply_bulk_meta(
    app: AppHandle,
    ids: Vec<i64>,
    creator: Option<String>,
    tags: Option<Vec<String>>,
) -> Result<(), String> {
    let db = app.state::<AppState>().db.clone();
    off_ui("apply_bulk_meta", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        db.apply_import_meta(&ids, creator.as_deref(), tags.as_deref())
    })
    .await
}

#[tauri::command]
async fn count_files_for_scope(
    app: AppHandle,
    folder_id: Option<i64>,
    include_subfolders: bool,
) -> Result<i64, String> {
    let db = app.state::<AppState>().db.clone();
    off_ui("count_files_for_scope", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        Ok(db.file_ids_for_creator_scope(folder_id, include_subfolders)?.len() as i64)
    })
    .await
}

#[tauri::command]
async fn set_creator_under_folder(
    app: AppHandle,
    folder_id: Option<i64>,
    creator: String,
    include_subfolders: bool,
) -> Result<i64, String> {
    let db = app.state::<AppState>().db.clone();
    off_ui("set_creator_under_folder", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        db.set_creator_under_folder(folder_id, &creator, include_subfolders)
    })
    .await
}

#[tauri::command]
async fn list_creators(app: AppHandle) -> Result<Vec<String>, String> {
    let db = app.state::<AppState>().db.clone();
    off_ui("list_creators", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        db.list_creators()
    })
    .await
}

#[tauri::command]
async fn list_tags(app: AppHandle) -> Result<Vec<String>, String> {
    let db = app.state::<AppState>().db.clone();
    off_ui("list_tags", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        db.list_tags()
    })
    .await
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RecycleOutcome {
    failed: Vec<String>,
    cancelled: bool,
}

#[tauri::command]
async fn recycle_paths(app: AppHandle, paths: Vec<String>) -> Result<RecycleOutcome, String> {
    let _timer = CommandTimer::start("recycle_paths");
    let _guard = acquire_disk(&app)?;
    let cancel = app.state::<AppState>().disk_cancel.clone();
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let (failed, cancelled) =
            import::recycle_paths_with(&paths, &[], &cancel, |progress| emit_disk(&handle, &progress))?;
        Ok(RecycleOutcome { failed, cancelled })
    })
    .await
    .map_err(|err| err.to_string())?
}

#[tauri::command]
async fn recycle_last_import(app: AppHandle) -> Result<RecycleOutcome, String> {
    let _timer = CommandTimer::start("recycle_last_import");
    let paths = app
        .state::<AppState>()
        .last_recycle_paths
        .lock()
        .map_err(|e| e.to_string())?
        .clone();
    let roots = app
        .state::<AppState>()
        .last_recycle_roots
        .lock()
        .map_err(|e| e.to_string())?
        .clone();
    let _guard = acquire_disk(&app)?;
    let cancel = app.state::<AppState>().disk_cancel.clone();
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let (failed, cancelled) =
            import::recycle_paths_with(&paths, &roots, &cancel, |progress| emit_disk(&handle, &progress))?;
        Ok(RecycleOutcome { failed, cancelled })
    })
    .await
    .map_err(|err| err.to_string())?
}

#[tauri::command]
async fn move_files(app: AppHandle, ids: Vec<i64>, folder_id: Option<i64>) -> Result<DiskOutcome, String> {
    let _timer = CommandTimer::start("move_files");
    block_on_disk(app, move |db, cancel, handle| {
        let cancelled = db.move_files_with(&ids, folder_id, cancel, |progress| emit_disk(&handle, &progress))?;
        Ok(DiskOutcome { cancelled })
    })
    .await
}

#[tauri::command]
async fn delete_files(app: AppHandle, ids: Vec<i64>) -> Result<DiskOutcome, String> {
    let _timer = CommandTimer::start("delete_files");
    let _guard = acquire_disk(&app)?;
    let cancel = app.state::<AppState>().disk_cancel.clone();
    let db = app.state::<AppState>().db.clone();
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let items = {
            let db = db.lock().map_err(|e| e.to_string())?;
            db.trash_items(&ids)?
        };
        let cancelled = recycle_and_drop_files(&db, &items, &cancel, |progress| emit_disk(&handle, &progress), |path| {
            trash::delete(path).map_err(|err| err.to_string())
        })?;
        Ok(DiskOutcome { cancelled })
    })
    .await
    .map_err(|err| err.to_string())?
}
