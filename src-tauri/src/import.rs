use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use sha2::{Digest, Sha256};
use walkdir::WalkDir;
use zip::ZipArchive;

use crate::db::AppDb;
use crate::names::{extension_of, is_archive, is_supported_file, sanitize_component, unique_file_path};

const BATCH_SIZE: u32 = 250;
const PROGRESS_MIN_INTERVAL: Duration = Duration::from_millis(250);
pub const SUMMARY_ID_CAP: usize = 200;

#[derive(Debug, Clone)]
pub struct ImportOutcome {
    pub imported_ids: Vec<i64>,
    pub imported_count: u32,
    pub duplicate_count: u32,
    pub unsupported_count: u32,
    pub failed: Vec<String>,
    pub recycle_paths: Vec<String>,
    pub cancelled: bool,
    pub pending_hash_count: u32,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    pub imported_ids: Vec<i64>,
    pub imported_count: u32,
    pub duplicate_count: u32,
    pub unsupported_count: u32,
    pub failed: Vec<String>,
    pub recycle_count: u32,
    pub cancelled: bool,
    pub pending_hash_count: u32,
}

pub fn summary_for_api(outcome: &ImportOutcome) -> ImportSummary {
    ImportSummary {
        imported_ids: if outcome.imported_ids.len() <= SUMMARY_ID_CAP {
            outcome.imported_ids.clone()
        } else {
            Vec::new()
        },
        imported_count: outcome.imported_count,
        duplicate_count: outcome.duplicate_count,
        unsupported_count: outcome.unsupported_count,
        failed: outcome.failed.clone(),
        recycle_count: outcome.recycle_paths.len() as u32,
        cancelled: outcome.cancelled,
        pending_hash_count: outcome.pending_hash_count,
    }
}

pub struct ImportProgress {
    pub current: u32,
    pub total: u32,
    pub message: String,
}

struct ImportProgressCtx<F: FnMut(ImportProgress)> {
    current: u32,
    total: u32,
    on_progress: F,
    last_emit: Instant,
    pending_message: Option<String>,
}

impl<F: FnMut(ImportProgress)> ImportProgressCtx<F> {
    fn emit_now(&mut self, message: impl Into<String>) {
        self.pending_message = None;
        self.last_emit = Instant::now();
        self.on_progress(ImportProgress {
            current: self.current,
            total: self.total.max(1),
            message: message.into(),
        });
    }

    fn emit(&mut self, message: impl Into<String>) {
        self.emit_now(message);
    }

    fn tick(&mut self, message: impl Into<String>) {
        self.current += 1;
        let msg = message.into();
        let now = Instant::now();
        if now.duration_since(self.last_emit) >= PROGRESS_MIN_INTERVAL {
            self.emit_now(msg);
        } else {
            self.pending_message = Some(msg);
        }
    }

    fn flush(&mut self) {
        if let Some(msg) = self.pending_message.take() {
            self.emit_now(msg);
        }
    }

    fn adjust_total_for_archive_contents(&mut self, inner_file_count: u32) {
        self.total = self.total.saturating_sub(1) + inner_file_count;
    }
}

struct ImportBatch {
    active: bool,
    inserts: u32,
}

impl ImportBatch {
    fn begin(db: &mut AppDb) -> Result<Self, String> {
        db.import_batch_begin()?;
        Ok(Self {
            active: true,
            inserts: 0,
        })
    }

    fn note_insert(&mut self, db: &mut AppDb) -> Result<(), String> {
        self.inserts += 1;
        if self.inserts >= BATCH_SIZE {
            self.commit(db)?;
            db.import_batch_begin()?;
            self.active = true;
            self.inserts = 0;
        }
        Ok(())
    }

    fn commit(&mut self, db: &mut AppDb) -> Result<(), String> {
        if self.active {
            db.import_batch_commit()?;
            self.active = false;
            self.inserts = 0;
        }
        Ok(())
    }

    fn rollback(&mut self, db: &mut AppDb) {
        if self.active {
            let _ = db.import_batch_rollback();
            self.active = false;
            self.inserts = 0;
        }
    }

    fn finish(&mut self, db: &mut AppDb) -> Result<(), String> {
        self.commit(db)
    }
}

struct FolderCache {
    relpath_by_id: HashMap<i64, String>,
    id_by_relpath: HashMap<String, i64>,
}

impl FolderCache {
    fn new(db: &AppDb) -> Result<Self, String> {
        let mut relpath_by_id = HashMap::new();
        let mut id_by_relpath = HashMap::new();
        for folder in db.list_folders()? {
            relpath_by_id.insert(folder.id, folder.relpath.clone());
            id_by_relpath.insert(folder.relpath, folder.id);
        }
        Ok(Self {
            relpath_by_id,
            id_by_relpath,
        })
    }

    fn ensure_folder_chain(
        &mut self,
        db: &mut AppDb,
        library_root: &Path,
        parent_id: Option<i64>,
        relative_dir: &Path,
    ) -> Result<Option<i64>, String> {
        let mut current = parent_id;
        if relative_dir.as_os_str().is_empty() {
            return Ok(current);
        }
        for component in relative_dir.components() {
            let raw = component.as_os_str().to_string_lossy();
            if raw == "." || raw.is_empty() {
                continue;
            }
            let name = sanitize_component(&raw);
            let parent_rel = match current {
                Some(id) => Some(
                    self.relpath_by_id
                        .get(&id)
                        .cloned()
                        .ok_or_else(|| format!("Folder {id} was not found."))?,
                ),
                None => None,
            };
            let relpath = match &parent_rel {
                Some(rel) => format!("{rel}/{name}"),
                None => name.clone(),
            };
            if let Some(id) = self.id_by_relpath.get(&relpath) {
                current = Some(*id);
                continue;
            }
            fs::create_dir_all(library_root.join(&relpath)).map_err(|e| e.to_string())?;
            db.conn
                .execute(
                    "INSERT INTO folders (parent_id, name, sort_order, relpath) VALUES (?1, ?2, 0, ?3)",
                    rusqlite::params![current, name, relpath],
                )
                .map_err(|e| e.to_string())?;
            let id = db.conn.last_insert_rowid();
            self.relpath_by_id.insert(id, relpath.clone());
            self.id_by_relpath.insert(relpath, id);
            current = Some(id);
        }
        Ok(current)
    }

    fn dest_dir(&self, library_root: &Path, folder_id: Option<i64>) -> Result<PathBuf, String> {
        match folder_id {
            Some(id) => {
                let rel = self
                    .relpath_by_id
                    .get(&id)
                    .ok_or_else(|| format!("Folder {id} was not found."))?;
                Ok(library_root.join(rel))
            }
            None => Ok(library_root.to_path_buf()),
        }
    }
}

#[cfg(test)]
pub(crate) static FORCE_COPY: AtomicBool = AtomicBool::new(false);

pub fn import_paths<F: FnMut(ImportProgress)>(
    db: &mut AppDb,
    paths: &[String],
    target_folder: Option<i64>,
    cancelled: &AtomicBool,
    on_progress: F,
) -> Result<ImportOutcome, String> {
    let library_root = db.library_root()?;
    let mut folder_cache = FolderCache::new(db)?;
    let mut batch = ImportBatch::begin(db)?;
    let mut summary = ImportOutcome {
        imported_ids: Vec::new(),
        imported_count: 0,
        duplicate_count: 0,
        unsupported_count: 0,
        failed: Vec::new(),
        recycle_paths: Vec::new(),
        cancelled: false,
        pending_hash_count: 0,
    };
    let mut jobs = Vec::new();
    for raw in paths {
        let path = PathBuf::from(raw);
        if !path.exists() {
            summary.failed.push(format!("Missing path: {raw}"));
            continue;
        }
        if path_within(&path, &library_root) {
            summary
                .failed
                .push(format!("Skipped a path inside the library: {raw}"));
            continue;
        }
        jobs.push(path);
    }
    let mut progress = ImportProgressCtx {
        current: 0,
        total: 0,
        on_progress,
        last_emit: Instant::now() - PROGRESS_MIN_INTERVAL,
        pending_message: None,
    };
    progress.emit("Counting files");
    let file_total = count_jobs(&jobs, cancelled)?;
    if cancelled.load(Ordering::SeqCst) {
        summary.cancelled = true;
        if batch.finish(db).is_err() {
            batch.rollback(db);
            return Err("Import batch commit failed.".into());
        }
        summary.pending_hash_count = db.count_unhashed()? as u32;
        progress.emit("Import stopped");
        return Ok(summary);
    }
    progress.total = file_total;
    progress.emit("Importing…");
    let import_result = (|| -> Result<(), String> {
        for path in jobs {
            if cancelled.load(Ordering::SeqCst) {
                summary.cancelled = true;
                break;
            }
            let ext = extension_of(&path.file_name().unwrap_or_default().to_string_lossy());
            if path.is_dir() {
                import_tree(
                    db,
                    &library_root,
                    &mut folder_cache,
                    &mut batch,
                    &path,
                    target_folder,
                    None,
                    0,
                    cancelled,
                    &mut summary,
                    &mut progress,
                )?;
            } else if is_archive(&ext) {
                import_archive(
                    db,
                    &library_root,
                    &mut folder_cache,
                    &mut batch,
                    &path,
                    target_folder,
                    0,
                    cancelled,
                    &mut summary,
                    &mut progress,
                )?;
            } else {
                import_file(
                    db,
                    &library_root,
                    &mut folder_cache,
                    &mut batch,
                    &path,
                    target_folder,
                    None,
                    true,
                    &mut summary,
                )?;
                progress.tick(file_name_of(&path));
            }
            if cancelled.load(Ordering::SeqCst) {
                summary.cancelled = true;
                break;
            }
        }
        Ok(())
    })();
    if let Err(err) = import_result {
        batch.rollback(db);
        return Err(err);
    }
    if batch.finish(db).is_err() {
        batch.rollback(db);
        return Err("Import batch commit failed.".into());
    }
    summary.pending_hash_count = db.count_unhashed()? as u32;
    progress.current = progress.total.max(progress.current);
    progress.flush();
    progress.emit(if summary.cancelled {
        "Import stopped"
    } else {
        "Import finished"
    });
    Ok(summary)
}

fn count_jobs(jobs: &[PathBuf], cancelled: &AtomicBool) -> Result<u32, String> {
    let mut total = 0u32;
    for path in jobs {
        if cancelled.load(Ordering::SeqCst) {
            return Ok(total);
        }
        if path.is_dir() {
            for entry in WalkDir::new(path).follow_links(false) {
                if cancelled.load(Ordering::SeqCst) {
                    return Ok(total);
                }
                if entry
                    .ok()
                    .map(|e| e.file_type().is_file())
                    .unwrap_or(false)
                {
                    total += 1;
                }
            }
        } else {
            total += 1;
        }
    }
    Ok(total)
}

fn import_tree<F: FnMut(ImportProgress)>(
    db: &mut AppDb,
    library_root: &Path,
    folder_cache: &mut FolderCache,
    batch: &mut ImportBatch,
    source_root: &Path,
    target_folder: Option<i64>,
    source_archive: Option<&str>,
    archive_depth: u8,
    cancelled: &AtomicBool,
    summary: &mut ImportOutcome,
    progress: &mut ImportProgressCtx<F>,
) -> Result<(), String> {
    for entry in WalkDir::new(source_root).follow_links(false) {
        if cancelled.load(Ordering::SeqCst) {
            summary.cancelled = true;
            return Ok(());
        }
        let entry = match entry {
            Ok(entry) => entry,
            Err(err) => {
                summary.failed.push(err.to_string());
                continue;
            }
        };
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let ext = extension_of(&path.file_name().unwrap_or_default().to_string_lossy());
        let rel_parent = path
            .parent()
            .unwrap_or(source_root)
            .strip_prefix(source_root)
            .unwrap_or(Path::new(""))
            .to_path_buf();
        let folder_id =
            folder_cache.ensure_folder_chain(db, library_root, target_folder, &rel_parent)?;
        if is_archive(&ext) {
            if archive_depth < 1 {
                import_archive(
                    db,
                    library_root,
                    folder_cache,
                    batch,
                    path,
                    folder_id,
                    archive_depth + 1,
                    cancelled,
                    summary,
                    progress,
                )?;
            } else {
                summary.unsupported_count += 1;
                progress.tick(file_name_of(path));
            }
            continue;
        }
        import_file(
            db,
            library_root,
            folder_cache,
            batch,
            path,
            folder_id,
            source_archive,
            source_archive.is_none(),
            summary,
        )?;
        progress.tick(file_name_of(path));
    }
    Ok(())
}

fn import_archive<F: FnMut(ImportProgress)>(
    db: &mut AppDb,
    library_root: &Path,
    folder_cache: &mut FolderCache,
    batch: &mut ImportBatch,
    archive_path: &Path,
    target_folder: Option<i64>,
    depth: u8,
    cancelled: &AtomicBool,
    summary: &mut ImportOutcome,
    progress: &mut ImportProgressCtx<F>,
) -> Result<(), String> {
    let stem = archive_path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "archive".into());
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let temp = db
        .data_dir
        .join("tmp-import")
        .join(format!("{}-{}", std::process::id(), stamp));
    let _ = fs::remove_dir_all(&temp);
    fs::create_dir_all(&temp).map_err(|e| e.to_string())?;
    let extract_result = extract_any(archive_path, &temp);
    if let Err(err) = extract_result {
        summary.failed.push(format!(
            "{}: {err}",
            archive_path.display()
        ));
        let _ = fs::remove_dir_all(&temp);
        progress.tick(file_name_of(archive_path));
        return Ok(());
    }
    progress.adjust_total_for_archive_contents(count_files_in_dir(&temp));
    let before_failed = summary.failed.len();
    let before_imported = summary.imported_count;
    let before_dup = summary.duplicate_count;
    let archive_name = archive_path
        .file_name()
        .map(|s| s.to_string_lossy().to_string());
    let holder = folder_cache.ensure_folder_chain(
        db,
        library_root,
        target_folder,
        Path::new(&stem),
    )?;
    import_tree(
        db,
        library_root,
        folder_cache,
        batch,
        &temp,
        holder,
        archive_name.as_deref(),
        depth,
        cancelled,
        summary,
        progress,
    )?;
    let _ = fs::remove_dir_all(&temp);
    let imported_something =
        summary.imported_count > before_imported || summary.duplicate_count > before_dup;
    if summary.failed.len() == before_failed && imported_something {
        summary
            .recycle_paths
            .push(archive_path.to_string_lossy().to_string());
    }
    Ok(())
}

fn import_file(
    db: &mut AppDb,
    library_root: &Path,
    folder_cache: &mut FolderCache,
    batch: &mut ImportBatch,
    source: &Path,
    folder_id: Option<i64>,
    source_archive: Option<&str>,
    can_recycle: bool,
    summary: &mut ImportOutcome,
) -> Result<(), String> {
    let file_name = source
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".into());
    let ext = extension_of(&file_name);
    if !is_supported_file(&ext) {
        summary.unsupported_count += 1;
        return Ok(());
    }
    let dest_dir = folder_cache.dest_dir(library_root, folder_id)?;
    fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
    let dest = unique_file_path(&dest_dir, &file_name);

    let force_copy = FORCE_COPY.load(Ordering::SeqCst);
    let linked = if !force_copy {
        fs::hard_link(source, &dest).is_ok()
    } else {
        false
    };

    if linked {
        let meta = dest.metadata().map_err(|e| e.to_string())?;
        let rel = dest
            .strip_prefix(library_root)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        let mtime = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        match db.insert_file_with_thumb_status(
            &file_name,
            &rel,
            &ext,
            meta.len() as i64,
            "",
            mtime,
            folder_id,
            source_archive,
            "unhashed",
        ) {
            Ok(id) => {
                batch.note_insert(db)?;
                summary.imported_ids.push(id);
                summary.imported_count += 1;
                if can_recycle {
                    summary
                        .recycle_paths
                        .push(source.to_string_lossy().to_string());
                }
            }
            Err(err) => {
                let _ = fs::remove_file(&dest);
                summary.failed.push(format!("{file_name}: {err}"));
            }
        }
        return Ok(());
    }

    let sha = match hash_file(source) {
        Ok(sha) => sha,
        Err(err) => {
            summary.failed.push(format!("{}: {err}", source.display()));
            return Ok(());
        }
    };
    if db.sha_exists(&sha)? {
        summary.duplicate_count += 1;
        return Ok(());
    }
    if let Err(err) = fs::copy(source, &dest) {
        summary
            .failed
            .push(format!("{}: {err}", source.display()));
        return Ok(());
    }
    let meta = match dest.metadata() {
        Ok(meta) => meta,
        Err(err) => {
            summary.failed.push(err.to_string());
            return Ok(());
        }
    };
    let rel = dest
        .strip_prefix(library_root)
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .replace('\\', "/");
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    match db.insert_file(
        &file_name,
        &rel,
        &ext,
        meta.len() as i64,
        &sha,
        mtime,
        folder_id,
        source_archive,
    ) {
        Ok(id) => {
            batch.note_insert(db)?;
            summary.imported_ids.push(id);
            summary.imported_count += 1;
            if can_recycle {
                summary
                    .recycle_paths
                    .push(source.to_string_lossy().to_string());
            }
        }
        Err(err) => {
            let _ = fs::remove_file(&dest);
            summary.failed.push(format!("{file_name}: {err}"));
        }
    }
    Ok(())
}

fn count_files_in_dir(source_root: &Path) -> u32 {
    let mut count = 0u32;
    for entry in WalkDir::new(source_root).follow_links(false) {
        if entry
            .ok()
            .map(|e| e.file_type().is_file())
            .unwrap_or(false)
        {
            count += 1;
        }
    }
    count
}

fn file_name_of(path: &Path) -> String {
    path.file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| path.display().to_string())
}

fn extract_any(archive: &Path, dest: &Path) -> Result<(), String> {
    let ext = extension_of(&archive.file_name().unwrap_or_default().to_string_lossy());
    match ext.as_str() {
        "zip" => extract_zip(archive, dest),
        "7z" => sevenz_rust::decompress_file(archive, dest).map_err(|e| e.to_string()),
        "rar" => extract_rar(archive, dest),
        other => Err(format!("Unsupported archive .{other}")),
    }
}

fn extract_zip(archive: &Path, dest: &Path) -> Result<(), String> {
    let file = File::open(archive).map_err(|e| e.to_string())?;
    let mut zip = ZipArchive::new(file).map_err(|e| e.to_string())?;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        let Some(rel) = entry.enclosed_name().map(|p| p.to_path_buf()) else {
            continue;
        };
        let out = dest.join(rel);
        if entry.is_dir() {
            fs::create_dir_all(&out).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(parent) = out.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut outfile = File::create(&out).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut outfile).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn extract_rar(archive_path: &Path, dest: &Path) -> Result<(), String> {
    let mut archive = unrar::Archive::new(archive_path)
        .open_for_processing()
        .map_err(|e| e.to_string())?;
    loop {
        let Some(header) = archive.read_header().map_err(|e| e.to_string())? else {
            break;
        };
        archive = header.extract_with_base(dest).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn hash_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 1024 * 64];
    loop {
        let n = file.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn path_within(path: &Path, root: &Path) -> bool {
    let Ok(path) = path.canonicalize() else {
        return false;
    };
    let Ok(root) = root.canonicalize() else {
        return false;
    };
    path.starts_with(root)
}

#[cfg(test)]
mod flow_tests {
    use super::*;
    use crate::db::{open, FolderFilter};
    use crate::hash_pass::drain_unhashed;
    use crate::rescan::rescan;
    use std::io::Write;
    use zip::write::SimpleFileOptions;
    use zip::ZipWriter;

    fn scratch() -> (PathBuf, PathBuf, PathBuf) {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis();
        let base = std::env::temp_dir().join(format!("3dfl-test-{}-{stamp}", std::process::id()));
        let data = base.join("data");
        let library = base.join("library");
        let incoming = base.join("incoming");
        fs::create_dir_all(&data).unwrap();
        fs::create_dir_all(&library).unwrap();
        fs::create_dir_all(&incoming).unwrap();
        (data, library, incoming)
    }

    fn finish_import(db: &mut AppDb, summary: ImportOutcome) -> ImportOutcome {
        let _ = drain_unhashed(db).unwrap();
        summary
    }

    static NO_CANCEL: AtomicBool = AtomicBool::new(false);

    #[test]
    fn import_organize_search_rescan_and_recycle() {
        let (data, library, incoming) = scratch();
        let mut db = open(&data).unwrap();
        assert!(db.settings().library_root.is_none());
        assert_eq!(db.settings().theme, "dark");
        let boot = db.set_library_root(&library).unwrap();
        assert!(db.set_library_root(&library).is_err());
        let names: Vec<_> = boot.folders.iter().map(|f| f.name.as_str()).collect();
        assert_eq!(names, ["FDM Prints", "Models", "Wargaming Terrain"]);
        for folder in &boot.folders {
            assert!(library.join(&folder.relpath).is_dir());
        }
        let models = boot.folders.iter().find(|f| f.name == "Models").unwrap().id;
        let terrain = boot
            .folders
            .iter()
            .find(|f| f.name == "Wargaming Terrain")
            .unwrap()
            .id;

        let first = incoming.join("Throne_of_Baal.stl");
        let second = incoming.join("copy-slot");
        fs::create_dir_all(&second).unwrap();
        let second = second.join("Throne_of_Baal.stl");
        fs::write(&first, b"solid a\nendsolid a\n").unwrap();
        fs::write(&second, b"solid b\nendsolid b\n").unwrap();

        let summary = finish_import(
            &mut db,
            import_paths(
                &mut db,
                &[first.to_string_lossy().to_string(), second.to_string_lossy().to_string()],
                Some(models),
                &NO_CANCEL,
                |_| {},
            )
            .unwrap(),
        );
        assert_eq!(summary.imported_count, 2);
        assert!(summary.failed.is_empty(), "{:?}", summary.failed);
        assert_eq!(summary.recycle_paths.len(), 2);
        let rows = db
            .list_files(FolderFilter::Id(models), "", "", "", "name")
            .unwrap();
        let stored: Vec<_> = rows.iter().map(|r| r.stored_relpath.clone()).collect();
        assert!(stored.iter().any(|p| p.ends_with("Throne_of_Baal.stl")));
        assert!(stored.iter().any(|p| p.ends_with("Throne_of_Baal (2).stl")));
        assert!(rows.iter().all(|r| r.sort_name == "Throne of Baal"));

        let again = import_paths(
            &mut db,
            &[first.to_string_lossy().to_string()],
            Some(models),
            &NO_CANCEL,
            |_| {},
        )
        .unwrap();
        assert_eq!(again.imported_count, 1);
        drain_unhashed(&mut db).unwrap();
        let after_dup = db
            .list_files(FolderFilter::Id(models), "", "", "", "name")
            .unwrap();
        assert_eq!(after_dup.len(), 2);
        assert!(again.recycle_paths.is_empty());

        let id = rows[0].id;
        db.update_file(id, "Throne of Baal", "Jason", "keep these notes", Some(models))
            .unwrap();
        db.set_tags(id, &["terrain".into(), "baal".into()]).unwrap();
        let found = db
            .list_files(FolderFilter::All, "thro", "", "", "name")
            .unwrap();
        assert!(found.iter().any(|r| r.id == id));
        let tagged = db
            .list_files(FolderFilter::All, "", "", "baal", "name")
            .unwrap();
        assert_eq!(tagged.len(), 1);

        let zip_path = incoming.join("Citadel.zip");
        {
            let file = File::create(&zip_path).unwrap();
            let mut zip = ZipWriter::new(file);
            zip.start_file("walls/Gate.stl", SimpleFileOptions::default()).unwrap();
            zip.write_all(b"solid gate\nendsolid gate\n").unwrap();
            zip.finish().unwrap();
        }
        let seven = incoming.join("Outpost.7z");
        let seven_src = incoming.join("seven-src");
        fs::create_dir_all(seven_src.join("floors")).unwrap();
        fs::write(seven_src.join("floors").join("Tile.obj"), b"o tile\n").unwrap();
        sevenz_rust::compress_to_path(&seven_src, &seven).unwrap();

        let archived = finish_import(
            &mut db,
            import_paths(
                &mut db,
                &[
                    zip_path.to_string_lossy().to_string(),
                    seven.to_string_lossy().to_string(),
                ],
                None,
                &NO_CANCEL,
                |_| {},
            )
            .unwrap(),
        );
        assert!(archived.failed.is_empty(), "{:?}", archived.failed);
        assert_eq!(archived.imported_count, 2);
        assert!(library.join("Citadel").join("walls").join("Gate.stl").is_file());
        assert!(library.join("Outpost").join("floors").join("Tile.obj").is_file());
        assert!(archived.recycle_paths.iter().any(|p| p.ends_with("Citadel.zip")));

        db.move_files(&[id], Some(terrain)).unwrap();
        let moved = db.file_location(id).unwrap();
        assert_eq!(moved.folder_id, Some(terrain));
        assert!(library.join(&moved.stored_relpath).is_file());

        let loose = library.join("FoundOnDisk");
        fs::create_dir_all(&loose).unwrap();
        let relocated_to = loose.join("Throne_of_Baal.stl");
        fs::rename(library.join(&moved.stored_relpath), &relocated_to).unwrap();
        let scan = rescan(&db, |_| {}).unwrap();
        assert!(scan.relocated >= 1);
        assert!(scan.added_folders >= 1);
        let after = db.file_location(id).unwrap();
        assert!(after
            .stored_relpath
            .replace('\\', "/")
            .ends_with("FoundOnDisk/Throne_of_Baal.stl"));
        let notes = db
            .list_files(FolderFilter::All, "thro", "Jason", "", "name")
            .unwrap();
        assert!(notes.iter().any(|r| r.id == id && r.notes == "keep these notes"));

        let empty = db.create_folder(Some(models), "Empty Bin", 0).unwrap();
        db.delete_folder(empty.id).unwrap();
        assert!(db.delete_folder(models).is_err());

        let doomed = db.file_location(id).unwrap();
        db.delete_files(&[id]).unwrap();
        assert!(!library.join(&doomed.stored_relpath).exists());
        let failed = recycle_paths(&[first.to_string_lossy().to_string()]).unwrap();
        assert!(failed.is_empty(), "{failed:?}");
        assert!(!first.exists());
        let _ = fs::remove_dir_all(data.parent().unwrap());
    }

    #[test]
    fn folder_import_emits_per_file_progress() {
        let (data, library, incoming) = scratch();
        let mut db = open(&data).unwrap();
        let boot = db.set_library_root(&library).unwrap();
        let models = boot.folders.iter().find(|f| f.name == "Models").unwrap().id;

        let pack = incoming.join("pack");
        fs::create_dir_all(pack.join("nested")).unwrap();
        fs::write(pack.join("a.stl"), b"solid a\nendsolid a\n").unwrap();
        fs::write(pack.join("nested").join("b.stl"), b"solid b\nendsolid b\n").unwrap();
        fs::write(pack.join("notes.txt"), b"skip").unwrap();

        let mut events: Vec<(u32, u32)> = Vec::new();
        let summary = finish_import(
            &mut db,
            import_paths(
                &mut db,
                &[pack.to_string_lossy().to_string()],
                Some(models),
                &NO_CANCEL,
                |p| events.push((p.current, p.total)),
            )
            .unwrap(),
        );
        assert_eq!(summary.imported_count, 2);
        assert_eq!(summary.unsupported_count, 1);

        let totals: Vec<u32> = events.iter().map(|(_, t)| *t).collect();
        assert!(
            totals.iter().any(|t| *t == 3),
            "expected total 3 files in folder, got totals {totals:?}"
        );
        let max_current = events.iter().map(|(c, _)| *c).max().unwrap_or(0);
        assert_eq!(max_current, 3, "progress should advance once per file: {events:?}");

        let _ = fs::remove_dir_all(data.parent().unwrap());
    }

    #[test]
    fn copy_path_when_force_copy() {
        let (data, library, incoming) = scratch();
        let mut db = open(&data).unwrap();
        let boot = db.set_library_root(&library).unwrap();
        let models = boot.folders.iter().find(|f| f.name == "Models").unwrap().id;
        let src = incoming.join("part.stl");
        fs::write(&src, b"solid x\nendsolid x\n").unwrap();
        FORCE_COPY.store(true, Ordering::SeqCst);
        let summary = import_paths(
            &mut db,
            &[src.to_string_lossy().to_string()],
            Some(models),
            &NO_CANCEL,
            |_| {},
        )
        .unwrap();
        FORCE_COPY.store(false, Ordering::SeqCst);
        assert_eq!(summary.imported_count, 1);
        assert_eq!(summary.recycle_paths.len(), 1);
        let rows = db
            .list_files(FolderFilter::Id(models), "", "", "", "name")
            .unwrap();
        assert_eq!(rows.len(), 1);
        assert!(!rows[0].sha256.is_empty());
        let _ = fs::remove_dir_all(data.parent().unwrap());
    }

    #[test]
    fn cancel_stops_after_current_file() {
        let (data, library, incoming) = scratch();
        let mut db = open(&data).unwrap();
        let boot = db.set_library_root(&library).unwrap();
        let models = boot.folders.iter().find(|f| f.name == "Models").unwrap().id;
        let pack = incoming.join("pack");
        fs::create_dir_all(&pack).unwrap();
        fs::write(pack.join("a.stl"), b"solid a\nendsolid a\n").unwrap();
        fs::write(pack.join("b.stl"), b"solid b\nendsolid b\n").unwrap();
        let cancel = AtomicBool::new(false);
        let summary = import_paths(
            &mut db,
            &[pack.to_string_lossy().to_string()],
            Some(models),
            &cancel,
            |p| {
                if p.current >= 1 {
                    cancel.store(true, Ordering::SeqCst);
                }
            },
        )
        .unwrap();
        let _ = drain_unhashed(&mut db).unwrap();
        assert!(summary.cancelled);
        assert_eq!(summary.imported_count, 1);
        let rows = db
            .list_files(FolderFilter::Id(models), "", "", "", "name")
            .unwrap();
        assert_eq!(rows.len(), 1);
        let _ = fs::remove_dir_all(data.parent().unwrap());
    }

    #[test]
    fn import_commits_more_than_batch_size() {
        let (data, library, incoming) = scratch();
        let mut db = open(&data).unwrap();
        let boot = db.set_library_root(&library).unwrap();
        let models = boot.folders.iter().find(|f| f.name == "Models").unwrap().id;
        let bulk = incoming.join("bulk");
        fs::create_dir_all(&bulk).unwrap();
        for i in 0..251 {
            fs::write(bulk.join(format!("f{i}.stl")), b"solid x\nendsolid x\n").unwrap();
        }
        let summary = import_paths(
            &mut db,
            &[bulk.to_string_lossy().to_string()],
            Some(models),
            &NO_CANCEL,
            |_| {},
        )
        .unwrap();
        assert_eq!(summary.imported_count, 251);
        assert!(db.is_autocommit());
        let rows = db
            .list_files(FolderFilter::Id(models), "", "", "", "name")
            .unwrap();
        assert_eq!(rows.len(), 251);
        let _ = fs::remove_dir_all(data.parent().unwrap());
    }

    #[test]
    fn hash_pass_drops_duplicate_hard_link() {
        let (data, library, incoming) = scratch();
        let mut db = open(&data).unwrap();
        let boot = db.set_library_root(&library).unwrap();
        let models = boot.folders.iter().find(|f| f.name == "Models").unwrap().id;
        let src = incoming.join("twin.stl");
        fs::write(&src, b"solid same\nendsolid same\n").unwrap();
        import_paths(
            &mut db,
            &[src.to_string_lossy().to_string()],
            Some(models),
            &NO_CANCEL,
            |_| {},
        )
        .unwrap();
        import_paths(
            &mut db,
            &[src.to_string_lossy().to_string()],
            Some(models),
            &NO_CANCEL,
            |_| {},
        )
        .unwrap();
        drain_unhashed(&db).unwrap();
        let rows = db
            .list_files(FolderFilter::Id(models), "", "", "", "name")
            .unwrap();
        assert_eq!(rows.len(), 1);
        let _ = fs::remove_dir_all(data.parent().unwrap());
    }

    #[test]
    fn hash_error_keeps_file_and_continues() {
        let (data, library, incoming) = scratch();
        let mut db = open(&data).unwrap();
        let boot = db.set_library_root(&library).unwrap();
        let models = boot.folders.iter().find(|f| f.name == "Models").unwrap().id;
        db.insert_file_with_thumb_status(
            "ghost.stl",
            "ghost.stl",
            "stl",
            1,
            "",
            0,
            Some(models),
            None,
            "unhashed",
        )
        .unwrap();
        let good = incoming.join("good.stl");
        fs::write(&good, b"solid ok\nendsolid ok\n").unwrap();
        import_paths(
            &mut db,
            &[good.to_string_lossy().to_string()],
            Some(models),
            &NO_CANCEL,
            |_| {},
        )
        .unwrap();
        drain_unhashed(&db).unwrap();
        let ghost = db
            .conn
            .query_row(
                "SELECT thumb_status FROM files WHERE stored_relpath = 'ghost.stl'",
                [],
                |r| r.get::<_, String>(0),
            )
            .unwrap();
        assert_eq!(ghost, "hash_error");
        assert!(!library.join("ghost.stl").exists());
        let rows = db
            .list_files(FolderFilter::Id(models), "", "", "", "name")
            .unwrap();
        assert!(rows.iter().any(|r| r.original_name == "good.stl"));
        let _ = fs::remove_dir_all(data.parent().unwrap());
    }

    #[test]
    fn clear_thumbs_leaves_unhashed() {
        let (data, library, _incoming) = scratch();
        let db = open(&data).unwrap();
        let boot = db.set_library_root(&library).unwrap();
        let models = boot.folders.iter().find(|f| f.name == "Models").unwrap().id;
        db.insert_file_with_thumb_status(
            "wait.stl",
            "Models/wait.stl",
            "stl",
            1,
            "",
            0,
            Some(models),
            None,
            "unhashed",
        )
        .unwrap();
        db.clear_thumbs().unwrap();
        let status: String = db
            .conn
            .query_row(
                "SELECT thumb_status FROM files WHERE stored_relpath = 'Models/wait.stl'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(status, "unhashed");
        let _ = fs::remove_dir_all(data.parent().unwrap());
    }
}

pub fn recycle_paths(paths: &[String]) -> Result<Vec<String>, String> {
    let mut failed = Vec::new();
    for path in paths {
        let p = PathBuf::from(path);
        if !p.exists() {
            continue;
        }
        if let Err(err) = trash::delete(&p) {
            failed.push(format!("{path}: {err}"));
        }
    }
    Ok(failed)
}
