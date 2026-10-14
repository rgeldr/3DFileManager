mod ctb;
mod db;
mod drag_out;
mod hash_pass;
mod import;
mod names;
mod preview;
mod relocate;
mod rescan;
mod settings;

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter, Manager, State};

use db::{AppDb, FolderFilter};
use settings::Settings;

struct AppState {
    db: Arc<Mutex<AppDb>>,
    import_cancel: AtomicBool,
    disk_cancel: Arc<AtomicBool>,
    disk_running: AtomicBool,
    last_recycle_paths: Mutex<Vec<String>>,
    last_recycle_roots: Mutex<Vec<String>>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DiskOutcome {
    cancelled: bool,
}

struct DiskGuard(AppHandle);

impl Drop for DiskGuard {
    fn drop(&mut self) {
        self.0
            .state::<AppState>()
            .disk_running
            .store(false, Ordering::SeqCst);
    }
}

fn acquire_disk(app: &AppHandle) -> Result<DiskGuard, String> {
    let state = app.state::<AppState>();
    if state
        .disk_running
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("Another library change is already running.".into());
    }
    state.disk_cancel.store(false, Ordering::SeqCst);
    Ok(DiskGuard(app.clone()))
}

fn emit_disk(app: &AppHandle, progress: &relocate::DiskProgress) {
    let _ = app.emit("disk-progress", progress);
}

async fn block_on_disk<T, F>(app: AppHandle, work: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&AppDb, &AtomicBool, AppHandle) -> Result<T, String> + Send + 'static,
{
    let _guard = acquire_disk(&app)?;
    let cancel = app.state::<AppState>().disk_cancel.clone();
    let db = app.state::<AppState>().db.clone();
    let worker = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        work(&db, &cancel, worker)
    })
    .await
    .map_err(|err| err.to_string())?
}

static DEBUG_LOG_LOCK: Mutex<()> = Mutex::new(());

fn data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("3D File Library")
}

fn allow_asset_scope(app: &AppHandle, path: &std::path::Path) {
    if let Ok(path) = path.canonicalize() {
        let _ = app.asset_protocol_scope().allow_directory(&path, true);
    }
}

#[tauri::command]
fn bootstrap(state: State<AppState>) -> Result<db::Bootstrap, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.bootstrap()
}

#[tauri::command]
fn set_library_root(app: AppHandle, state: State<AppState>, path: String) -> Result<db::Bootstrap, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let result = db.set_library_root(PathBuf::from(path).as_path())?;
    if let Some(root) = &result.settings.library_root {
        allow_asset_scope(&app, PathBuf::from(root).as_path());
    }
    allow_asset_scope(&app, &db.data_dir.join("thumbs"));
    Ok(result)
}

#[tauri::command]
fn set_theme(state: State<AppState>, theme: String) -> Result<(), String> {
    if theme != "dark" && theme != "light" {
        return Err("Unknown theme.".into());
    }
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut settings = db.settings();
    settings.theme = theme;
    db.save_settings(&settings)
}

#[tauri::command]
fn set_grid_size(state: State<AppState>, grid_size: String) -> Result<(), String> {
    if !matches!(grid_size.as_str(), "medium" | "large" | "extraLarge") {
        return Err("Unknown grid size.".into());
    }
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut settings = db.settings();
    settings.grid_size = grid_size;
    db.save_settings(&settings)
}

#[tauri::command]
fn create_folder(state: State<AppState>, parent_id: Option<i64>, name: String) -> Result<db::FolderRow, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.create_folder(parent_id, &name, 0)
}

#[tauri::command]
async fn rename_folder(app: AppHandle, id: i64, name: String) -> Result<DiskOutcome, String> {
    block_on_disk(app, move |db, cancel, app| {
        let cancelled = db.rename_folder_with(id, &name, cancel, |progress| emit_disk(&app, &progress))?;
        Ok(DiskOutcome { cancelled })
    })
    .await
}

#[tauri::command]
async fn delete_folder(app: AppHandle, id: i64) -> Result<DiskOutcome, String> {
    block_on_disk(app, move |db, _cancel, _app| {
        db.delete_folder(id)?;
        Ok(DiskOutcome { cancelled: false })
    })
    .await
}

#[tauri::command]
async fn move_folder(app: AppHandle, id: i64, parent_id: Option<i64>) -> Result<DiskOutcome, String> {
    block_on_disk(app, move |db, cancel, app| {
        let cancelled = db.move_folder_with(id, parent_id, cancel, false, |progress| {
            emit_disk(&app, &progress)
        })?;
        Ok(DiskOutcome { cancelled })
    })
    .await
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListFilesArgs {
    folder: String,
    folder_id: Option<i64>,
    query: String,
    creator: String,
    tag: String,
    sort: String,
}

#[tauri::command]
fn list_files(state: State<AppState>, args: ListFilesArgs) -> Result<Vec<db::FileRow>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let filter = match args.folder.as_str() {
        "all" => FolderFilter::All,
        "root" => FolderFilter::Root,
        "id" => FolderFilter::Id(args.folder_id.ok_or("Missing folder id")?),
        _ => return Err("Unknown folder filter.".into()),
    };
    db.list_files(filter, &args.query, &args.creator, &args.tag, &args.sort)
}

#[tauri::command]
fn missing_files(state: State<AppState>) -> Result<Vec<db::FileRow>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.missing_files()
}

#[tauri::command]
fn remove_missing(state: State<AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.remove_missing()
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
    block_on_disk(app, move |db, cancel, handle| {
        let cancelled = db.update_file_with(id, &sort_name, &creator, &notes, folder_id, cancel, |progress| {
            emit_disk(&handle, &progress)
        })?;
        Ok(DiskOutcome { cancelled })
    })
    .await
}

#[tauri::command]
fn set_tags(state: State<AppState>, id: i64, tags: Vec<String>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.set_tags(id, &tags)
}

#[tauri::command]
fn add_tags_under_folder(
    state: State<AppState>,
    folder_id: Option<i64>,
    tags: Vec<String>,
) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.add_tags_under_folder(folder_id, &tags)
}

#[tauri::command]
fn apply_bulk_meta(
    state: State<AppState>,
    ids: Vec<i64>,
    creator: Option<String>,
    tags: Option<Vec<String>>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.apply_import_meta(&ids, creator.as_deref(), tags.as_deref())
}

#[tauri::command]
fn set_pane_widths(state: State<AppState>, sidebar_width: u32, inspector_width: u32) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.set_pane_widths(sidebar_width, inspector_width)
}

#[tauri::command]
fn count_files_for_scope(
    state: State<AppState>,
    folder_id: Option<i64>,
    include_subfolders: bool,
) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    Ok(db.file_ids_for_creator_scope(folder_id, include_subfolders)?.len() as i64)
}

#[tauri::command]
fn set_creator_under_folder(
    state: State<AppState>,
    folder_id: Option<i64>,
    creator: String,
    include_subfolders: bool,
) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.set_creator_under_folder(folder_id, &creator, include_subfolders)
}

#[tauri::command]
fn prepare_drag_paths(paths: Vec<String>, icon_path: String) -> drag_out::PreparedDrag {
    drag_out::prepare_drag_paths(&paths, &icon_path)
}

#[tauri::command]
fn list_creators(state: State<AppState>) -> Result<Vec<String>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.list_creators()
}

#[tauri::command]
fn list_tags(state: State<AppState>) -> Result<Vec<String>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.list_tags()
}

#[tauri::command]
async fn import_paths(
    app: AppHandle,
    paths: Vec<String>,
    folder_id: Option<i64>,
) -> Result<import::ImportSummary, String> {
    let _guard = acquire_disk(&app)?;
    let state = app.state::<AppState>();
    state.import_cancel.store(false, Ordering::SeqCst);
    let mut db = state.db.lock().map_err(|e| e.to_string())?;
    let app_emit = app.clone();
    let outcome = import::import_paths(
        &mut db,
        &paths,
        folder_id,
        &state.import_cancel,
        |progress| {
            let _ = app_emit.emit(
                "import-progress",
                serde_json::json!({
                    "current": progress.current,
                    "total": progress.total,
                    "message": progress.message,
                }),
            );
        },
    )?;
    drop(db);
    if let Ok(mut stored) = state.last_recycle_paths.lock() {
        *stored = outcome.recycle_paths.clone();
    }
    if let Ok(mut stored) = state.last_recycle_roots.lock() {
        *stored = outcome.recycle_roots.clone();
    }
    hash_pass::spawn_hash_pass_if_needed(app.clone(), state.db.clone());
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

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RecycleOutcome {
    failed: Vec<String>,
    cancelled: bool,
}

#[tauri::command]
async fn recycle_paths(app: AppHandle, paths: Vec<String>) -> Result<RecycleOutcome, String> {
    block_on_disk(app, move |_db, cancel, handle| {
        let (failed, cancelled) =
            import::recycle_paths_with(&paths, &[], cancel, |progress| emit_disk(&handle, &progress))?;
        Ok(RecycleOutcome { failed, cancelled })
    })
    .await
}

#[tauri::command]
async fn recycle_last_import(app: AppHandle) -> Result<RecycleOutcome, String> {
    let state = app.state::<AppState>();
    let paths = state
        .last_recycle_paths
        .lock()
        .map_err(|e| e.to_string())?
        .clone();
    let roots = state
        .last_recycle_roots
        .lock()
        .map_err(|e| e.to_string())?
        .clone();
    drop(state);
    block_on_disk(app, move |_db, cancel, handle| {
        let (failed, cancelled) =
            import::recycle_paths_with(&paths, &roots, cancel, |progress| emit_disk(&handle, &progress))?;
        Ok(RecycleOutcome { failed, cancelled })
    })
    .await
}

#[tauri::command]
async fn move_files(app: AppHandle, ids: Vec<i64>, folder_id: Option<i64>) -> Result<DiskOutcome, String> {
    block_on_disk(app, move |db, cancel, handle| {
        let cancelled = db.move_files_with(&ids, folder_id, cancel, |progress| emit_disk(&handle, &progress))?;
        Ok(DiskOutcome { cancelled })
    })
    .await
}

#[tauri::command]
async fn delete_files(app: AppHandle, ids: Vec<i64>) -> Result<DiskOutcome, String> {
    block_on_disk(app, move |db, cancel, handle| {
        let cancelled = db.delete_files_with(&ids, cancel, |progress| emit_disk(&handle, &progress))?;
        Ok(DiskOutcome { cancelled })
    })
    .await
}

#[tauri::command]
async fn rescan_library(app: AppHandle) -> Result<rescan::RescanSummary, String> {
    block_on_disk(app, move |db, cancel, handle| {
        rescan::rescan_with(db, cancel, |progress| emit_disk(&handle, &progress))
    })
    .await
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ThumbJob {
    kind: String,
    id: i64,
    absolute_path: String,
    ext: String,
    size_bytes: i64,
}

enum ThumbAction {
    Ok(Vec<u8>),
    Unavailable,
    Retry,
    Render,
    Unhashed,
}

fn classify_thumb(root: &std::path::Path, candidate: &db::ThumbCandidate) -> ThumbAction {
    if candidate.sha256.is_empty() {
        return ThumbAction::Unhashed;
    }
    let absolute = root.join(&candidate.stored_relpath);
    if !absolute.is_file() {
        return ThumbAction::Unavailable;
    }
    match preview::extract_thumbnail_png(&absolute) {
        Ok(Some(png)) => ThumbAction::Ok(png),
        Ok(None) => {
            if names::is_mesh(&candidate.ext) && candidate.size_bytes <= 150 * 1024 * 1024 {
                ThumbAction::Render
            } else {
                ThumbAction::Unavailable
            }
        }
        Err(preview::ThumbFail::Decode(message)) => {
            let _ = debug_log(format!(
                "thumb-decode id={} path={} error={message}",
                candidate.id,
                absolute.display()
            ));
            ThumbAction::Unavailable
        }
        Err(preview::ThumbFail::Io(message)) => {
            let _ = debug_log(format!(
                "thumb-io id={} path={} error={message}",
                candidate.id,
                absolute.display()
            ));
            ThumbAction::Retry
        }
    }
}

fn apply_thumb_action(db: &AppDb, candidate: &db::ThumbCandidate, action: ThumbAction) -> Result<ThumbJob, String> {
    let absolute = db.library_root()?.join(&candidate.stored_relpath);
    let job = |kind: &str| ThumbJob {
        kind: kind.into(),
        id: candidate.id,
        absolute_path: absolute.to_string_lossy().to_string(),
        ext: candidate.ext.clone(),
        size_bytes: candidate.size_bytes,
    };
    match action {
        ThumbAction::Unhashed => {
            db.set_thumb_status(candidate.id, "unhashed")?;
            Ok(job("skip"))
        }
        ThumbAction::Unavailable => {
            db.set_thumb_status(candidate.id, "unavailable")?;
            Ok(job("skip"))
        }
        ThumbAction::Retry => {
            db.note_thumb_io_failure(candidate.id)?;
            Ok(job("skip"))
        }
        ThumbAction::Render => Ok(job("render")),
        ThumbAction::Ok(png) => {
            let dest = db::thumb_path(&db.data_dir, &candidate.sha256);
            if let Err(err) = fs::write(&dest, png) {
                let _ = debug_log(format!("thumb-write id={} error={err}", candidate.id));
                db.note_thumb_io_failure(candidate.id)?;
                return Ok(job("skip"));
            }
            db.mark_thumb_ok(candidate.id)?;
            Ok(job("done"))
        }
    }
}

#[tauri::command]
fn next_thumbnail(state: State<AppState>) -> Result<Option<ThumbJob>, String> {
    let (candidate, root) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let Some(candidate) = db.claim_next_pending_thumb()? else {
            return Ok(None);
        };
        let root = db.library_root()?;
        (candidate, root)
    };
    let action = classify_thumb(&root, &candidate);
    let db = state.db.lock().map_err(|e| e.to_string())?;
    Ok(Some(apply_thumb_action(&db, &candidate, action)?))
}

#[tauri::command]
fn save_rendered_thumb(state: State<AppState>, id: i64, png: Vec<u8>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let loc = db.file_location(id)?;
    if loc.sha256.is_empty() {
        db.set_thumb_status(id, "unhashed")?;
        return Ok(());
    }
    let Some(png) = preview::png_from_bytes(&png) else {
        db.set_thumb_status(id, "unavailable")?;
        return Ok(());
    };
    let dest = db::thumb_path(&db.data_dir, &loc.sha256);
    if let Err(err) = fs::write(&dest, png) {
        let _ = debug_log(format!("thumb-write id={id} error={err}"));
        db.note_thumb_io_failure(id)?;
        return Ok(());
    }
    db.mark_thumb_ok(id)
}

#[tauri::command]
fn mark_thumb_unavailable(state: State<AppState>, id: i64) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.set_thumb_status(id, "unavailable")
}

#[tauri::command]
fn clear_thumbnail_cache(state: State<AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.clear_thumbs()
}

#[tauri::command]
fn drag_icon_path(app: AppHandle) -> Result<String, String> {
    let path = app
        .path()
        .resolve("icons/drag.png", tauri::path::BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    if !path.is_file() {
        return Err(format!("Drag icon was not found at {}.", path.display()));
    }
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn debug_log(line: String) -> Result<String, String> {
    let dir = data_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("debug.log");
    let _guard = DEBUG_LOG_LOCK.lock().map_err(|e| e.to_string())?;
    if path.exists() {
        let len = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
        if len > 1_048_576 {
            let bytes = fs::read(&path).map_err(|e| e.to_string())?;
            let keep = 512_000usize;
            let start = bytes.len().saturating_sub(keep);
            fs::write(&path, &bytes[start..]).map_err(|e| e.to_string())?;
        }
    }
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    writeln!(file, "{line}").map_err(|e| e.to_string())?;
    eprintln!("{line}");
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn get_settings(state: State<AppState>) -> Result<Settings, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    Ok(db.settings())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_drag::init())
        .setup(|app| {
            let dir = data_dir();
            let db = db::open(&dir).expect("open database");
            requeue_image_thumbs_once(&db);
            if let Some(root) = db.settings().library_root.clone() {
                allow_asset_scope(app.handle(), PathBuf::from(&root).as_path());
            }
            allow_asset_scope(app.handle(), &dir.join("thumbs"));
            let state = AppState {
                db: Arc::new(Mutex::new(db)),
                import_cancel: AtomicBool::new(false),
                disk_cancel: Arc::new(AtomicBool::new(false)),
                disk_running: AtomicBool::new(false),
                last_recycle_paths: Mutex::new(Vec::new()),
                last_recycle_roots: Mutex::new(Vec::new()),
            };
            hash_pass::spawn_hash_pass_if_needed(app.handle().clone(), state.db.clone());
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bootstrap,
            get_settings,
            set_library_root,
            set_theme,
            set_grid_size,
            set_pane_widths,
            create_folder,
            rename_folder,
            delete_folder,
            move_folder,
            list_files,
            missing_files,
            remove_missing,
            update_file,
            set_tags,
            add_tags_under_folder,
            apply_bulk_meta,
            count_files_for_scope,
            set_creator_under_folder,
            list_creators,
            list_tags,
            import_paths,
            cancel_import,
            cancel_disk_op,
            recycle_paths,
            recycle_last_import,
            move_files,
            delete_files,
            rescan_library,
            next_thumbnail,
            save_rendered_thumb,
            mark_thumb_unavailable,
            clear_thumbnail_cache,
            drag_icon_path,
            prepare_drag_paths,
            debug_log
        ])
        .run(tauri::generate_context!())
        .expect("error while running 3D File Library");
}

fn requeue_image_thumbs_once(db: &AppDb) {
    let mut settings = db.settings();
    if settings.thumb_retry >= 1 {
        return;
    }
    match db.requeue_unavailable_images() {
        Ok(count) => {
            eprintln!("requeued {count} unavailable image thumbnails");
            settings.thumb_retry = 1;
            if let Err(err) = db.save_settings(&settings) {
                eprintln!("could not save thumb retry flag: {err}");
            }
        }
        Err(err) => eprintln!("could not requeue image thumbnails: {err}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::Settings;

    #[test]
    fn png_thumbnail_is_written_once_and_empty_sha_is_not() {
        let dir = std::env::temp_dir().join(format!("filelib-settle-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let db = db::open(&dir).unwrap();
        let root = dir.join("library");
        fs::create_dir_all(&root).unwrap();
        let mut settings = Settings::default();
        settings.library_root = Some(root.to_string_lossy().to_string());
        db.save_settings(&settings).unwrap();
        let png_path = root.join("pic.png");
        image::RgbImage::from_pixel(20, 10, image::Rgb([1, 2, 3]))
            .save(&png_path)
            .unwrap();
        let id = db
            .insert_file("pic.png", "pic.png", "png", 20, "sha-pic", 1, None, None)
            .unwrap();
        let candidate = db.claim_next_pending_thumb().unwrap().unwrap();
        let job = apply_thumb_action(&db, &candidate, classify_thumb(&root, &candidate)).unwrap();
        assert_eq!(job.kind, "done");
        assert_eq!(job.id, id);
        assert!(db::thumb_path(&dir, "sha-pic").is_file());
        let status: String = db
            .conn
            .query_row("SELECT thumb_status FROM files WHERE id = ?1", [id], |row| row.get(0))
            .unwrap();
        assert_eq!(status, "ok");
        assert!(db.claim_next_pending_thumb().unwrap().is_none());

        let empty = db
            .insert_file_with_thumb_status("empty.png", "empty.png", "png", 1, "", 1, None, None, "none")
            .unwrap();
        fs::write(root.join("empty.png"), b"not-a-real-png").unwrap();
        let candidate = db.claim_next_pending_thumb().unwrap().unwrap();
        assert_eq!(candidate.id, empty);
        let job = apply_thumb_action(&db, &candidate, classify_thumb(&root, &candidate)).unwrap();
        assert_eq!(job.kind, "skip");
        assert!(!db::thumb_path(&dir, "").exists());
        let status: String = db
            .conn
            .query_row("SELECT thumb_status FROM files WHERE id = ?1", [empty], |row| row.get(0))
            .unwrap();
        assert_eq!(status, "unhashed");
        let _ = fs::remove_dir_all(&dir);
    }
}
