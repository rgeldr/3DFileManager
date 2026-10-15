struct AppState {
    db: Arc<Mutex<AppDb>>,
    /// Thumbnail claims use this connection so a folder listing never waits on
    /// image decode, and decode never waits on a folder listing.
    thumbs: Arc<Mutex<AppDb>>,
    import_cancel: Arc<AtomicBool>,
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

fn command_log_line(name: &str, ms: u128) -> String {
    format!("command {name} {ms}ms")
}

fn command_should_log(ms: u128) -> bool {
    ms >= 50
}

struct CommandTimer {
    name: &'static str,
    started: Instant,
}

impl CommandTimer {
    fn start(name: &'static str) -> Self {
        Self {
            name,
            started: Instant::now(),
        }
    }
}

impl Drop for CommandTimer {
    fn drop(&mut self) {
        let ms = self.started.elapsed().as_millis();
        if !command_should_log(ms) {
            return;
        }
        let _ = write_debug_log(command_log_line(self.name, ms));
    }
}

async fn off_ui<T, F>(name: &'static str, work: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    let timer = CommandTimer::start(name);
    let result = tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|err| err.to_string())?;
    drop(timer);
    result
}

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
