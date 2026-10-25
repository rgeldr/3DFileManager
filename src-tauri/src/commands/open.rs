/// Resolve a catalog row to a real file that stays inside the library root.
/// `stored_relpath` comes from the database, so a `..` segment or an absolute
/// path must not escape the root.
pub(crate) fn contained_library_dir(root: &std::path::Path, relpath: &str) -> Result<PathBuf, String> {
    if relpath.contains('\0') {
        return Err("That folder is outside the library.".into());
    }
    let root = root.canonicalize().map_err(|err| err.to_string())?;
    let joined = if relpath.is_empty() { root.clone() } else { root.join(relpath) };
    let path = joined
        .canonicalize()
        .map_err(|_| "That folder is missing from the library.".to_string())?;
    if !path.starts_with(&root) || !path.is_dir() {
        return Err("That folder is outside the library.".into());
    }
    Ok(path)
}

pub(crate) fn contained_library_file(root: &std::path::Path, stored_relpath: &str) -> Result<PathBuf, String> {
    if stored_relpath.is_empty() || stored_relpath.contains('\0') {
        return Err("That file is outside the library.".into());
    }
    let root = root.canonicalize().map_err(|err| err.to_string())?;
    let joined = root.join(stored_relpath);
    let path = joined
        .canonicalize()
        .map_err(|_| "That file is missing from the library.".to_string())?;
    if !path.starts_with(&root) || !path.is_file() {
        return Err("That file is outside the library.".into());
    }
    Ok(path)
}

const TEXT_PREVIEW_BYTES: usize = 4096;

/// Keep printable text from the first 4KB. Invalid UTF-8 and control bytes are dropped.
pub(crate) fn clean_text_preview(bytes: &[u8]) -> String {
    let end = bytes.len().min(TEXT_PREVIEW_BYTES);
    let decoded = String::from_utf8_lossy(&bytes[..end]);
    let mut out = String::with_capacity(decoded.len());
    for ch in decoded.chars() {
        if ch == '\u{FFFD}' || ch == '\u{FEFF}' {
            continue;
        }
        if ch == '\n' || ch == '\t' {
            out.push(ch);
            continue;
        }
        if ch.is_control() {
            continue;
        }
        out.push(ch);
    }
    out
}

fn read_text_preview(path: &std::path::Path) -> Result<String, String> {
    let mut file = fs::File::open(path).map_err(|err| err.to_string())?;
    let mut buf = [0u8; TEXT_PREVIEW_BYTES];
    let n = file.read(&mut buf).map_err(|err| err.to_string())?;
    Ok(clean_text_preview(&buf[..n]))
}

fn catalog_file_path(db: &AppDb, file_id: i64) -> Result<PathBuf, String> {
    let loc = db.file_location(file_id)?;
    let root = db.library_root()?;
    contained_library_file(&root, &loc.stored_relpath)
}

fn drag_source_for_id(db: &AppDb, id: i64) -> Result<drag_out::DragSource, String> {
    let loc = db.file_location(id)?;
    let root = db.library_root()?;
    let path = contained_library_file(&root, &loc.stored_relpath)?;
    Ok(drag_out::DragSource {
        path: path.to_string_lossy().to_string(),
        file_name: loc.original_name,
        ext: names::extension_of(&loc.stored_relpath),
    })
}

/// Catalog ids only. A path the page invented never becomes a drag source.
fn drag_sources_for_ids(db: &AppDb, ids: &[i64]) -> (Vec<drag_out::DragSource>, Vec<String>) {
    let mut sources = Vec::new();
    let mut skipped = Vec::new();
    for id in ids {
        match drag_source_for_id(db, *id) {
            Ok(source) => sources.push(source),
            Err(err) => skipped.push(err),
        }
    }
    (sources, skipped)
}

#[tauri::command]
async fn prepare_drag_paths(app: AppHandle, ids: Vec<i64>, icon_path: String) -> drag_out::PreparedDrag {
    let _timer = CommandTimer::start("prepare_drag_paths");
    let db = app.state::<AppState>().db.clone();
    let prepared = tauri::async_runtime::spawn_blocking(move || {
        let Ok(db) = db.lock() else {
            return drag_out::PreparedDrag {
                paths: Vec::new(),
                skipped: vec!["The library is busy.".into()],
                reports: Vec::new(),
                icon_bytes: 0,
            };
        };
        let (sources, mut skipped) = drag_sources_for_ids(&db, &ids);
        let mut prepared = drag_out::prepare_drag_paths(&sources, &icon_path);
        skipped.append(&mut prepared.skipped);
        prepared.skipped = skipped;
        prepared
    })
    .await
    .unwrap_or_else(|err| drag_out::PreparedDrag {
        paths: Vec::new(),
        skipped: vec![err.to_string()],
        reports: Vec::new(),
        icon_bytes: 0,
    });
    let _ = write_debug_log(drag_out::drag_log_line(&prepared.paths));
    prepared
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DragOutcome {
    result: String,
    effect: String,
}

/// Synchronous on purpose: Tauri runs a sync command on the UI thread, and
/// Windows `DoDragDrop` has to run on that STA while the button is still down.
#[tauri::command]
fn start_file_drag(app: AppHandle, ids: Vec<i64>, icon_path: String) -> Result<DragOutcome, String> {
    let db = app.state::<AppState>().db.clone();
    let paths = {
        let db = db.lock().map_err(|err| err.to_string())?;
        let (sources, skipped) = drag_sources_for_ids(&db, &ids);
        let prepared = drag_out::prepare_drag_paths(&sources, &icon_path);
        if prepared.paths.is_empty() {
            let message = if skipped.is_empty() {
                prepared.skipped.join(", ")
            } else {
                skipped.join(", ")
            };
            return Err(if message.is_empty() {
                "Could not drag these files.".into()
            } else {
                message
            });
        }
        prepared.paths
    };
    let _ = write_debug_log(drag_out::drag_start_line(&paths, &icon_path));
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window is not available.".to_string())?;
    match drag_session::start(&window, &paths, &icon_path) {
        Ok(started) => {
            if started.finished {
                let mut line = drag_out::drag_result_line(&started.result, &started.effect);
                if !started.detail.is_empty() {
                    line.push(' ');
                    line.push_str(&started.detail);
                }
                let _ = write_debug_log(line);
            }
            Ok(DragOutcome {
                result: started.result,
                effect: started.effect,
            })
        }
        Err(err) => {
            let _ = write_debug_log(format!(
                "{} message={err}",
                drag_out::drag_result_line("error", "none")
            ));
            Err(err)
        }
    }
}

#[tauri::command]
async fn drag_icon_path(app: AppHandle) -> Result<String, String> {
    off_ui("drag_icon_path", move || {
        let path = app
            .path()
            .resolve("icons/drag.png", tauri::path::BaseDirectory::Resource)
            .map_err(|e| e.to_string())?;
        if !path.is_file() {
            return Err(format!("Drag icon was not found at {}.", path.display()));
        }
        Ok(path.to_string_lossy().to_string())
    })
    .await
}

#[tauri::command]
async fn debug_log(line: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || write_debug_log(line))
        .await
        .map_err(|err| err.to_string())?
}

pub(crate) fn write_debug_log(line: String) -> Result<String, String> {
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
async fn open_in_default_app(app: AppHandle, file_id: i64) -> Result<(), String> {
    let db = app.state::<AppState>().db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let path = {
            let db = db.lock().map_err(|err| err.to_string())?;
            catalog_file_path(&db, file_id)?
        };
        app.opener()
            .open_path(path.to_string_lossy().to_string(), None::<&str>)
            .map_err(|err| err.to_string())
    })
    .await
    .map_err(|err| err.to_string())?
}

#[tauri::command]
async fn reveal_file(app: AppHandle, file_id: i64) -> Result<(), String> {
    let db = app.state::<AppState>().db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let path = {
            let db = db.lock().map_err(|err| err.to_string())?;
            catalog_file_path(&db, file_id)?
        };
        app.opener()
            .reveal_item_in_dir(&path)
            .map_err(|err| err.to_string())
    })
    .await
    .map_err(|err| err.to_string())?
}

#[tauri::command]
async fn reveal_folder(app: AppHandle, folder_id: Option<i64>) -> Result<(), String> {
    let db = app.state::<AppState>().db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let path = {
            let db = db.lock().map_err(|err| err.to_string())?;
            let root = db.library_root()?;
            let rel = match folder_id {
                Some(id) => db.folder_relpath(id)?,
                None => String::new(),
            };
            contained_library_dir(&root, &rel)?
        };
        app.opener()
            .reveal_item_in_dir(&path)
            .map_err(|err| err.to_string())
    })
    .await
    .map_err(|err| err.to_string())?
}

#[tauri::command]
async fn text_preview(app: AppHandle, file_id: i64) -> Result<String, String> {
    let db = app.state::<AppState>().db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let path = {
            let db = db.lock().map_err(|err| err.to_string())?;
            let loc = db.file_location(file_id)?;
            let ext = names::extension_of(&loc.stored_relpath);
            if !matches!(ext.as_str(), "txt" | "md" | "scad") {
                return Ok(String::new());
            }
            let root = db.library_root()?;
            contained_library_file(&root, &loc.stored_relpath)?
        };
        read_text_preview(&path)
    })
    .await
    .map_err(|err| err.to_string())?
}
