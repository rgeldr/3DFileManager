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
    #[serde(default)]
    exts: Vec<String>,
    sort: String,
    #[serde(default = "default_sort_direction")]
    sort_direction: String,
    #[serde(default)]
    limit: Option<u32>,
    #[serde(default)]
    offset: u32,
}

fn default_tag_match() -> String {
    "any".into()
}

fn default_sort_direction() -> String {
    "asc".into()
}

fn folder_filter(folder: &str, folder_id: Option<i64>) -> Result<FolderFilter, String> {
    match folder {
        "all" => Ok(FolderFilter::All),
        "root" => Ok(FolderFilter::Root),
        "id" => Ok(FolderFilter::Id(folder_id.ok_or("Missing folder id")?)),
        "subtree" => Ok(FolderFilter::Subtree(folder_id.ok_or("Missing folder id")?)),
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

pub(crate) fn query_files(db: &AppDb, args: &ListFilesArgs) -> Result<Vec<db::FileRow>, String> {
    let filter = folder_filter(&args.folder, args.folder_id)?;
    let tag_match = tag_match_mode(&args.tag_match)?;
    let exts = crate::names::ext_filter_values(&args.exts);
    let ext_refs: Vec<&str> = exts.iter().map(String::as_str).collect();
    db.query_files(db::FileQuery {
        folder: filter,
        query: &args.query,
        creator: &args.creator,
        tag: &args.tag,
        tag_ids: &args.tag_ids,
        tag_match,
        exts: &ext_refs,
        sort: &args.sort,
        sort_direction: &args.sort_direction,
        limit: args.limit,
        offset: args.offset,
    })
}

pub(crate) fn query_tag_counts(db: &AppDb, args: &TagCountArgs) -> Result<Vec<db::TagCount>, String> {
    let filter = folder_filter(&args.folder, args.folder_id)?;
    let exts = crate::names::ext_filter_values(&args.exts);
    let ext_refs: Vec<&str> = exts.iter().map(String::as_str).collect();
    db.tag_counts(filter, &args.query, &args.creator, &ext_refs)
}

pub(crate) fn query_type_counts(db: &AppDb, args: &TypeCountArgs) -> Result<Vec<db::TypeCount>, String> {
    let filter = folder_filter(&args.folder, args.folder_id)?;
    let tag_match = tag_match_mode(&args.tag_match)?;
    db.type_counts(filter, &args.query, &args.creator, &args.tag_ids, tag_match)
}

pub(crate) fn list_creators_for_args(db: &AppDb, args: &ListCreatorsArgs) -> Result<Vec<String>, String> {
    let filter = if args.folder.is_empty() {
        FolderFilter::All
    } else {
        folder_filter(&args.folder, args.folder_id)?
    };
    db.list_creators(filter)
}

pub(crate) fn count_files_for_scope_work(
    db: &AppDb,
    folder_id: Option<i64>,
    include_subfolders: bool,
) -> Result<i64, String> {
    Ok(db.file_ids_for_creator_scope(folder_id, include_subfolders)?.len() as i64)
}

#[tauri::command]
async fn list_files(app: AppHandle, args: ListFilesArgs) -> Result<Vec<db::FileRow>, String> {
    let db = app.state::<AppState>().db.clone();
    off_ui("list_files", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        query_files(&db, &args)
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
    #[serde(default)]
    exts: Vec<String>,
}

#[tauri::command]
async fn list_tag_counts(app: AppHandle, args: TagCountArgs) -> Result<Vec<db::TagCount>, String> {
    let db = app.state::<AppState>().db.clone();
    off_ui("list_tag_counts", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        query_tag_counts(&db, &args)
    })
    .await
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct TypeCountArgs {
    folder: String,
    folder_id: Option<i64>,
    query: String,
    creator: String,
    #[serde(default)]
    tag_ids: Vec<i64>,
    #[serde(default = "default_tag_match")]
    tag_match: String,
}

#[tauri::command]
async fn list_type_counts(app: AppHandle, args: TypeCountArgs) -> Result<Vec<db::TypeCount>, String> {
    let db = app.state::<AppState>().db.clone();
    off_ui("list_type_counts", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        query_type_counts(&db, &args)
    })
    .await
}

pub(crate) fn absent_files(db: &AppDb) -> Result<Vec<db::FileRow>, String> {
    db.missing_files()
}

pub(crate) fn drop_absent_files(db: &AppDb) -> Result<(), String> {
    db.remove_missing()
}

pub(crate) fn replace_file_tags(db: &AppDb, id: i64, tags: &[String]) -> Result<(), String> {
    db.set_tags(id, tags)
}

pub(crate) fn tags_under_folder(db: &AppDb, folder_id: Option<i64>, tags: &[String]) -> Result<i64, String> {
    db.add_tags_under_folder(folder_id, tags)
}

pub(crate) fn tags_on_files(db: &AppDb, ids: &[i64], tags: &[String]) -> Result<i64, String> {
    db.add_tags_to_files(ids, tags)
}

pub(crate) fn bulk_file_meta(
    db: &AppDb,
    ids: &[i64],
    creator: Option<&str>,
    tags: Option<&[String]>,
) -> Result<(), String> {
    db.apply_import_meta(ids, creator, tags)
}

pub(crate) fn assign_creator(
    db: &AppDb,
    folder_id: Option<i64>,
    creator: &str,
    include_subfolders: bool,
) -> Result<i64, String> {
    db.set_creator_under_folder(folder_id, creator, include_subfolders)
}

pub(crate) fn catalog_tags(db: &AppDb) -> Result<Vec<String>, String> {
    db.list_tags()
}

pub(crate) fn tag_color_rows(db: &AppDb) -> Result<Vec<db::TagColorRow>, String> {
    db.list_tag_colors()
}

pub(crate) fn paint_tag(db: &AppDb, id: i64, color: Option<&str>) -> Result<(), String> {
    db.set_tag_color(id, color)
}

pub(crate) fn rename_file_work(db: &AppDb, id: i64, name: &str) -> Result<(), String> {
    db.rename_library_file(id, name)
}

pub(crate) fn update_file_work(
    db: &AppDb,
    id: i64,
    sort_name: &str,
    creator: &str,
    notes: &str,
    folder_id: Option<i64>,
    cancel: &AtomicBool,
    mut progress: impl FnMut(relocate::DiskProgress),
) -> Result<bool, String> {
    db.update_file_with(id, sort_name, creator, notes, folder_id, cancel, progress)
}

pub(crate) fn move_files_work(
    db: &AppDb,
    ids: &[i64],
    folder_id: Option<i64>,
    cancel: &AtomicBool,
    mut progress: impl FnMut(relocate::DiskProgress),
) -> Result<bool, String> {
    db.move_files_with(ids, folder_id, cancel, progress)
}

pub(crate) fn delete_files_work(
    db: &Mutex<AppDb>,
    ids: &[i64],
    cancel: &AtomicBool,
    mut progress: impl FnMut(relocate::DiskProgress),
    mut recycle: impl FnMut(&std::path::Path) -> Result<(), String>,
) -> Result<bool, String> {
    let items = {
        let db = db.lock().map_err(|e| e.to_string())?;
        db.trash_items(ids)?
    };
    recycle_and_drop_files(db, &items, cancel, progress, recycle)
}

#[tauri::command]
async fn missing_files(app: AppHandle) -> Result<Vec<db::FileRow>, String> {
    let db = app.state::<AppState>().db.clone();
    off_ui("missing_files", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        absent_files(&db)
    })
    .await
}

#[tauri::command]
async fn remove_missing(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    let source = window.label().to_string();
    let db = app.state::<AppState>().db.clone();
    off_ui("remove_missing", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        drop_absent_files(&db)
    })
    .await?;
    emit_library_changed(&app, LibraryChangeKind::Files, &source);
    Ok(())
}

#[tauri::command]
async fn update_file(
    app: AppHandle,
    window: WebviewWindow,
    id: i64,
    sort_name: String,
    creator: String,
    notes: String,
    folder_id: Option<i64>,
) -> Result<DiskOutcome, String> {
    let source = window.label().to_string();
    let _timer = CommandTimer::start("update_file");
    let result = block_on_disk(&app, move |db, cancel, handle| {
        let cancelled = update_file_work(
            db,
            id,
            &sort_name,
            &creator,
            &notes,
            folder_id,
            cancel,
            |progress| emit_disk(&handle, &progress),
        )?;
        Ok::<DiskOutcome, String>(DiskOutcome { cancelled })
    })
    .await?;
    emit_library_changed(&app, LibraryChangeKind::Files, &source);
    Ok(result)
}

#[tauri::command]
async fn rename_file(app: AppHandle, window: WebviewWindow, id: i64, name: String) -> Result<DiskOutcome, String> {
    let source = window.label().to_string();
    let _timer = CommandTimer::start("rename_file");
    let result = block_on_disk(&app, move |db, _cancel, _handle| {
        rename_file_work(db, id, &name)?;
        Ok(DiskOutcome { cancelled: false })
    })
    .await?;
    emit_library_changed(&app, LibraryChangeKind::Files, &source);
    Ok(result)
}

#[tauri::command]
async fn set_tags(app: AppHandle, window: WebviewWindow, id: i64, tags: Vec<String>) -> Result<(), String> {
    let source = window.label().to_string();
    let db = app.state::<AppState>().db.clone();
    off_ui("set_tags", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        replace_file_tags(&db, id, &tags)
    })
    .await?;
    emit_library_changed(&app, LibraryChangeKind::Tags, &source);
    Ok(())
}

#[tauri::command]
async fn add_tags_under_folder(
    app: AppHandle,
    window: WebviewWindow,
    folder_id: Option<i64>,
    tags: Vec<String>,
) -> Result<i64, String> {
    let source = window.label().to_string();
    let db = app.state::<AppState>().db.clone();
    let count = off_ui("add_tags_under_folder", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        tags_under_folder(&db, folder_id, &tags)
    })
    .await?;
    emit_library_changed(&app, LibraryChangeKind::Tags, &source);
    Ok(count)
}

#[tauri::command]
async fn add_tags_to_files(
    app: AppHandle,
    window: WebviewWindow,
    ids: Vec<i64>,
    tags: Vec<String>,
) -> Result<i64, String> {
    let source = window.label().to_string();
    let db = app.state::<AppState>().db.clone();
    let count = off_ui("add_tags_to_files", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        tags_on_files(&db, &ids, &tags)
    })
    .await?;
    emit_library_changed(&app, LibraryChangeKind::Tags, &source);
    Ok(count)
}

#[tauri::command]
async fn apply_bulk_meta(
    app: AppHandle,
    window: WebviewWindow,
    ids: Vec<i64>,
    creator: Option<String>,
    tags: Option<Vec<String>>,
) -> Result<(), String> {
    let source = window.label().to_string();
    let db = app.state::<AppState>().db.clone();
    off_ui("apply_bulk_meta", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        bulk_file_meta(&db, &ids, creator.as_deref(), tags.as_deref())
    })
    .await?;
    emit_library_changed(&app, LibraryChangeKind::Tags, &source);
    Ok(())
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
        count_files_for_scope_work(&db, folder_id, include_subfolders)
    })
    .await
}

#[tauri::command]
async fn set_creator_under_folder(
    app: AppHandle,
    window: WebviewWindow,
    folder_id: Option<i64>,
    creator: String,
    include_subfolders: bool,
) -> Result<i64, String> {
    let source = window.label().to_string();
    let db = app.state::<AppState>().db.clone();
    let count = off_ui("set_creator_under_folder", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        assign_creator(&db, folder_id, &creator, include_subfolders)
    })
    .await?;
    emit_library_changed(&app, LibraryChangeKind::Tags, &source);
    Ok(count)
}

#[derive(serde::Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ListCreatorsArgs {
    #[serde(default)]
    folder: String,
    folder_id: Option<i64>,
}

#[tauri::command]
async fn list_creators(app: AppHandle, args: ListCreatorsArgs) -> Result<Vec<String>, String> {
    let db = app.state::<AppState>().db.clone();
    off_ui("list_creators", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        list_creators_for_args(&db, &args)
    })
    .await
}

#[tauri::command]
async fn list_tags(app: AppHandle) -> Result<Vec<String>, String> {
    let db = app.state::<AppState>().db.clone();
    off_ui("list_tags", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        catalog_tags(&db)
    })
    .await
}

#[tauri::command]
async fn list_tag_colors(app: AppHandle) -> Result<Vec<db::TagColorRow>, String> {
    let db = app.state::<AppState>().db.clone();
    off_ui("list_tag_colors", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        tag_color_rows(&db)
    })
    .await
}

#[tauri::command]
async fn set_tag_color(
    app: AppHandle,
    window: WebviewWindow,
    id: i64,
    color: Option<String>,
) -> Result<(), String> {
    let source = window.label().to_string();
    let db = app.state::<AppState>().db.clone();
    off_ui("set_tag_color", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        paint_tag(&db, id, color.as_deref())
    })
    .await?;
    emit_library_changed(&app, LibraryChangeKind::Tags, &source);
    Ok(())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RecycleOutcome {
    failed: Vec<String>,
    cancelled: bool,
}

pub(crate) fn recycle_paths_work(
    paths: &[String],
    roots: &[String],
    cancel: &AtomicBool,
    mut progress: impl FnMut(relocate::DiskProgress),
) -> Result<RecycleOutcome, String> {
    let (failed, cancelled) = import::recycle_paths_with(paths, roots, cancel, progress)?;
    Ok(RecycleOutcome { failed, cancelled })
}

#[tauri::command]
async fn recycle_paths(app: AppHandle, window: WebviewWindow, paths: Vec<String>) -> Result<RecycleOutcome, String> {
    let source = window.label().to_string();
    let _timer = CommandTimer::start("recycle_paths");
    let _guard = acquire_disk(&app)?;
    let cancel = app.state::<AppState>().disk_cancel.clone();
    let handle = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        recycle_paths_work(&paths, &[], &cancel, |progress| emit_disk(&handle, &progress))
    })
    .await
    .map_err(|err| err.to_string())??;
    emit_library_changed(&app, LibraryChangeKind::Files, &source);
    Ok(result)
}

#[tauri::command]
async fn recycle_last_import(app: AppHandle, window: WebviewWindow) -> Result<RecycleOutcome, String> {
    let source = window.label().to_string();
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
    let result = tauri::async_runtime::spawn_blocking(move || {
        recycle_paths_work(&paths, &roots, &cancel, |progress| emit_disk(&handle, &progress))
    })
    .await
    .map_err(|err| err.to_string())??;
    emit_library_changed(&app, LibraryChangeKind::Files, &source);
    Ok(result)
}

#[tauri::command]
async fn move_files(
    app: AppHandle,
    window: WebviewWindow,
    ids: Vec<i64>,
    folder_id: Option<i64>,
) -> Result<DiskOutcome, String> {
    let source = window.label().to_string();
    let _timer = CommandTimer::start("move_files");
    let result = block_on_disk(&app, move |db, cancel, handle| {
        let cancelled = move_files_work(db, &ids, folder_id, cancel, |progress| emit_disk(&handle, &progress))?;
        Ok::<DiskOutcome, String>(DiskOutcome { cancelled })
    })
    .await?;
    emit_library_changed(&app, LibraryChangeKind::Files, &source);
    Ok(result)
}

#[tauri::command]
async fn delete_files(app: AppHandle, window: WebviewWindow, ids: Vec<i64>) -> Result<DiskOutcome, String> {
    let source = window.label().to_string();
    let _timer = CommandTimer::start("delete_files");
    let _guard = acquire_disk(&app)?;
    let cancel = app.state::<AppState>().disk_cancel.clone();
    let db = app.state::<AppState>().db.clone();
    let handle = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let cancelled = delete_files_work(&db, &ids, &cancel, |progress| emit_disk(&handle, &progress), |path| {
            trash::delete(path).map_err(|err| err.to_string())
        })?;
        Ok::<DiskOutcome, String>(DiskOutcome { cancelled })
    })
    .await
    .map_err(|err| err.to_string())??;
    emit_library_changed(&app, LibraryChangeKind::Files, &source);
    Ok(result)
}
