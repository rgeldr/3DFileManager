use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::db::AppDb;
use crate::relocate::{self, DiskProgress};
use crate::settings::{self, Settings};

pub const BACKUP_FORMAT: &str = "3d-file-library-backup";
pub const BACKUP_VERSION: u32 = 1;

const LIBRARY_DIR_NAME: &str = "library";
const MANIFEST_NAME: &str = "manifest.json";
const DB_NAME: &str = "library.db";
const SETTINGS_NAME: &str = "settings.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupManifest {
    pub format: String,
    pub version: u32,
    pub excludes: Vec<String>,
}

impl BackupManifest {
    fn new() -> Self {
        Self {
            format: BACKUP_FORMAT.into(),
            version: BACKUP_VERSION,
            excludes: vec!["thumbs".into(), "debug.log".into(), "tmp-import".into()],
        }
    }
}

/// Writes a portable backup into an empty folder: catalog DB, settings, and library files.
/// Thumbnail cache and debug/import temps are omitted.
pub fn export_library<F: FnMut(DiskProgress)>(
    db: &AppDb,
    dest: &Path,
    cancel: &AtomicBool,
    mut progress: F,
) -> Result<bool, String> {
    let library_root = db.library_root()?;
    if !library_root.is_dir() {
        return Err(format!(
            "The current library folder was not found: {}",
            library_root.display()
        ));
    }
    if !dest.is_dir() {
        return Err("Pick an existing empty folder for the backup.".into());
    }
    let dest = dest.canonicalize().map_err(|e| e.to_string())?;
    if !dir_is_empty(&dest)? {
        return Err("The backup folder must be empty. Choose or create an empty folder.".into());
    }
    if dest.starts_with(&library_root) || library_root.starts_with(&dest) {
        return Err("Choose a backup folder outside the library.".into());
    }

    let library_dest = dest.join(LIBRARY_DIR_NAME);
    let db_dest = dest.join(DB_NAME);
    let settings_dest = dest.join(SETTINGS_NAME);
    let manifest_dest = dest.join(MANIFEST_NAME);

    let cleanup = |path: &Path| {
        let _ = fs::remove_dir_all(path);
        let _ = fs::create_dir_all(path);
    };

    if cancel.load(Ordering::SeqCst) {
        return Ok(true);
    }

    progress(DiskProgress {
        current: 0,
        total: 0,
        name: "Writing catalog".into(),
        bytes_done: 0,
        bytes_total: 0,
        cancellable: true,
    });
    vacuum_into(&db.conn, &db_dest).map_err(|err| {
        cleanup(&dest);
        err
    })?;

    if cancel.load(Ordering::SeqCst) {
        cleanup(&dest);
        return Ok(true);
    }

    let mut backup_settings = db.settings();
    // Restore always chooses a new library folder; do not carry the old absolute path.
    backup_settings.library_root = None;
    settings::save(&dest, &backup_settings).map_err(|err| {
        cleanup(&dest);
        err
    })?;
    debug_assert_eq!(settings_dest, settings::settings_path(&dest));

    let manifest = BackupManifest::new();
    let manifest_text = serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?;
    fs::write(&manifest_dest, manifest_text).map_err(|err| {
        cleanup(&dest);
        err.to_string()
    })?;

    if cancel.load(Ordering::SeqCst) {
        cleanup(&dest);
        return Ok(true);
    }

    let cancelled = relocate::copy_tree(&library_root, &library_dest, cancel, &mut progress)
        .map_err(|err| {
            cleanup(&dest);
            err
        })?;
    if cancelled {
        cleanup(&dest);
        return Ok(true);
    }

    // Ensure excluded paths were never written.
    let _ = fs::remove_dir_all(dest.join("thumbs"));
    let _ = fs::remove_file(dest.join("debug.log"));
    let _ = fs::remove_dir_all(dest.join("tmp-import"));

    Ok(false)
}

/// Restores a backup into `library_dest` and replaces the live catalog in `data_dir`.
/// Returns `Ok(true)` when cancelled.
pub fn restore_library<F: FnMut(DiskProgress)>(
    db: &mut AppDb,
    thumbs: &mut AppDb,
    backup_dir: &Path,
    library_dest: &Path,
    cancel: &AtomicBool,
    mut progress: F,
) -> Result<bool, String> {
    let backup_dir = backup_dir.canonicalize().map_err(|e| e.to_string())?;
    let manifest = load_manifest(&backup_dir)?;
    if manifest.format != BACKUP_FORMAT {
        return Err("That folder is not a 3D File Library backup.".into());
    }
    if manifest.version != BACKUP_VERSION {
        return Err(format!(
            "Unsupported backup version {} (expected {BACKUP_VERSION}).",
            manifest.version
        ));
    }

    let backup_db = backup_dir.join(DB_NAME);
    let backup_library = backup_dir.join(LIBRARY_DIR_NAME);
    if !backup_db.is_file() {
        return Err("Backup is missing library.db.".into());
    }
    if !backup_library.is_dir() {
        return Err("Backup is missing the library folder.".into());
    }
    if !library_dest.is_dir() {
        return Err("Pick an existing empty folder for the restored library.".into());
    }
    let library_dest = library_dest.canonicalize().map_err(|e| e.to_string())?;
    if !dir_is_empty(&library_dest)? {
        return Err(
            "The destination folder must be empty. Choose or create an empty folder.".into(),
        );
    }
    if library_dest.starts_with(&backup_dir) || backup_dir.starts_with(&library_dest) {
        return Err("Choose a library folder outside the backup.".into());
    }

    let cancelled =
        relocate::copy_tree(&backup_library, &library_dest, cancel, &mut progress)?;
    if cancelled {
        return Ok(true);
    }

    let data_dir = db.data_dir.clone();
    let staged_db = data_dir.join("library.db.restore");
    let _ = fs::remove_file(&staged_db);
    fs::copy(&backup_db, &staged_db).map_err(|e| {
        let _ = fs::remove_dir_all(&library_dest);
        let _ = fs::create_dir_all(&library_dest);
        e.to_string()
    })?;

    let backup_settings = settings::load(&backup_dir);
    let mut next_settings = backup_settings;
    next_settings.library_root = Some(library_dest.to_string_lossy().to_string());
    // Prefer regenerating thumbnails after a thumbs-free restore.
    next_settings.thumb_retry = 0;

    if let Err(err) = swap_live_catalog(db, thumbs, &data_dir, &staged_db, &next_settings) {
        let _ = fs::remove_file(&staged_db);
        let _ = fs::remove_dir_all(&library_dest);
        let _ = fs::create_dir_all(&library_dest);
        return Err(err);
    }

    if let Err(err) = db.clear_thumbs() {
        return Err(format!(
            "Library restored, but thumbnail status could not be reset: {err}"
        ));
    }

    Ok(false)
}

fn swap_live_catalog(
    db: &mut AppDb,
    thumbs: &mut AppDb,
    data_dir: &Path,
    staged_db: &Path,
    settings: &Settings,
) -> Result<(), String> {
    // Close live handles so Windows can replace library.db.
    replace_with_memory_db(db, data_dir)?;
    replace_with_memory_db(thumbs, data_dir)?;

    let live_db = data_dir.join(DB_NAME);
    let _ = fs::remove_file(data_dir.join(format!("{DB_NAME}-wal")));
    let _ = fs::remove_file(data_dir.join(format!("{DB_NAME}-shm")));
    fs::rename(staged_db, &live_db).or_else(|_| {
        fs::copy(staged_db, &live_db).map(|_| ()).and_then(|_| fs::remove_file(staged_db))
    })
    .map_err(|e| e.to_string())?;

    settings::save(data_dir, settings)?;

    *db = crate::db::open(data_dir)?;
    *thumbs = crate::db::open(data_dir)?;
    Ok(())
}

fn replace_with_memory_db(slot: &mut AppDb, data_dir: &Path) -> Result<(), String> {
    let conn = Connection::open_in_memory().map_err(|e| e.to_string())?;
    let old = std::mem::replace(
        slot,
        AppDb {
            conn,
            data_dir: data_dir.to_path_buf(),
        },
    );
    drop(old);
    Ok(())
}

fn vacuum_into(conn: &Connection, dest: &Path) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let _ = fs::remove_file(dest);
    let path = sqlite_path_literal(dest);
    conn.execute_batch(&format!("VACUUM INTO '{path}'"))
        .map_err(|e| e.to_string())
}

fn sqlite_path_literal(path: &Path) -> String {
    path.to_string_lossy()
        .replace('\\', "/")
        .replace('\'', "''")
}

fn load_manifest(backup_dir: &Path) -> Result<BackupManifest, String> {
    let path = backup_dir.join(MANIFEST_NAME);
    let text = fs::read_to_string(&path).map_err(|_| {
        "Backup is missing manifest.json. Pick the folder created by Backup library….".to_string()
    })?;
    serde_json::from_str(&text).map_err(|e| format!("Backup manifest is invalid: {e}"))
}

fn dir_is_empty(path: &Path) -> Result<bool, String> {
    let mut entries = fs::read_dir(path).map_err(|e| e.to_string())?;
    Ok(entries.next().is_none())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use std::path::PathBuf;
    use std::sync::atomic::AtomicBool;

    fn scratch(name: &str) -> (PathBuf, AppDb, PathBuf) {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis();
        let base = std::env::temp_dir().join(format!(
            "filelib-backup-{name}-{}-{stamp}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&base);
        let data = base.join("data");
        let library = base.join("library-root");
        fs::create_dir_all(&data).unwrap();
        fs::create_dir_all(library.join("Models")).unwrap();
        fs::write(library.join("Models").join("a.stl"), b"solid a").unwrap();
        let db = db::open(&data).unwrap();
        let mut settings = Settings::default();
        settings.library_root = Some(library.to_string_lossy().to_string());
        settings.theme = "light".into();
        db.save_settings(&settings).unwrap();
        // Thumbnail cache and debug log must not be exported.
        fs::create_dir_all(data.join("thumbs")).unwrap();
        fs::write(data.join("thumbs").join("deadbeef.png"), b"png").unwrap();
        fs::write(data.join("debug.log"), b"log").unwrap();
        (base, db, library)
    }

    #[test]
    fn export_includes_catalog_and_files_excludes_thumbs() {
        let (base, db, _library) = scratch("export");
        let dest = base.join("backup");
        fs::create_dir_all(&dest).unwrap();
        let cancel = AtomicBool::new(false);
        let cancelled = export_library(&db, &dest, &cancel, |_| {}).unwrap();
        assert!(!cancelled);
        assert!(dest.join(DB_NAME).is_file());
        assert!(dest.join(SETTINGS_NAME).is_file());
        assert!(dest.join(MANIFEST_NAME).is_file());
        assert_eq!(
            fs::read(dest.join(LIBRARY_DIR_NAME).join("Models").join("a.stl")).unwrap(),
            b"solid a"
        );
        assert!(!dest.join("thumbs").exists());
        assert!(!dest.join("debug.log").exists());
        let settings = settings::load(&dest);
        assert!(settings.library_root.is_none());
        assert_eq!(settings.theme, "light");
        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn export_rejects_non_empty_destination() {
        let (base, db, _) = scratch("nonempty");
        let dest = base.join("backup");
        fs::create_dir_all(&dest).unwrap();
        fs::write(dest.join("keep.txt"), b"x").unwrap();
        let cancel = AtomicBool::new(false);
        let err = export_library(&db, &dest, &cancel, |_| {}).unwrap_err();
        assert!(err.contains("empty"), "{err}");
        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn restore_round_trip_to_new_data_dir() {
        let (base, db, _) = scratch("roundtrip");
        let backup = base.join("backup");
        fs::create_dir_all(&backup).unwrap();
        let cancel = AtomicBool::new(false);
        export_library(&db, &backup, &cancel, |_| {}).unwrap();

        let restore_data = base.join("restore-data");
        let library_dest = base.join("restore-library");
        fs::create_dir_all(&restore_data).unwrap();
        fs::create_dir_all(&library_dest).unwrap();
        let mut live = db::open(&restore_data).unwrap();
        let mut thumbs = db::open(&restore_data).unwrap();
        let cancelled = super::restore_library(
            &mut live,
            &mut thumbs,
            &backup,
            &library_dest,
            &cancel,
            |_| {},
        )
        .unwrap();
        assert!(!cancelled);
        let settings = live.settings();
        let restored_root = PathBuf::from(settings.library_root.as_ref().expect("root"));
        assert_eq!(
            restored_root.canonicalize().unwrap(),
            library_dest.canonicalize().unwrap()
        );
        assert_eq!(settings.theme, "light");
        assert_eq!(
            fs::read(library_dest.join("Models").join("a.stl")).unwrap(),
            b"solid a"
        );
        assert!(restore_data.join(DB_NAME).is_file());
        assert!(!restore_data.join("thumbs").join("deadbeef.png").exists());
        drop(db);
        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn export_cancel_clears_partial_backup() {
        let (base, db, _) = scratch("cancel");
        let dest = base.join("backup");
        fs::create_dir_all(&dest).unwrap();
        let cancel = AtomicBool::new(false);
        let cancelled = export_library(&db, &dest, &cancel, |progress| {
            if progress.total > 0 {
                cancel.store(true, Ordering::SeqCst);
            }
        })
        .unwrap();
        assert!(cancelled);
        assert!(dir_is_empty(&dest).unwrap());
        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn manifest_and_sqlite_path_literal_round_trip() {
        let manifest = BackupManifest::new();
        assert_eq!(manifest.format, BACKUP_FORMAT);
        assert_eq!(manifest.version, BACKUP_VERSION);
        assert_eq!(
            manifest.excludes,
            vec!["thumbs".to_string(), "debug.log".to_string(), "tmp-import".to_string()]
        );
        let built = BackupManifest {
            format: "other".into(),
            version: 9,
            excludes: vec!["thumbs".into()],
        };
        assert_eq!(built.format, "other");
        assert_eq!(built.version, 9);
        assert_eq!(built.excludes, vec!["thumbs".to_string()]);
        assert_eq!(
            sqlite_path_literal(Path::new(r"C:\O'Brien\lib.db")),
            "C:/O''Brien/lib.db"
        );

        let dir = std::env::temp_dir().join(format!("filelib-manifest-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let missing = load_manifest(&dir).unwrap_err();
        assert!(missing.contains("manifest.json"), "{missing}");
        fs::write(dir.join(MANIFEST_NAME), b"{}").unwrap();
        let invalid = load_manifest(&dir).unwrap_err();
        assert!(invalid.contains("invalid"), "{invalid}");
        fs::write(
            dir.join(MANIFEST_NAME),
            serde_json::to_string(&manifest).unwrap(),
        )
        .unwrap();
        let loaded = load_manifest(&dir).unwrap();
        assert_eq!(loaded.format, manifest.format);
        assert_eq!(loaded.version, manifest.version);
        assert_eq!(loaded.excludes, manifest.excludes);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn vacuum_into_copies_a_readable_catalog() {
        let (base, db, _) = scratch("vacuum");
        db.insert_file("kept.stl", "kept.stl", "stl", 3, "sha-kept", 1, None, None)
            .unwrap();
        let dest = base.join("O'Brien").join("copy.db");
        vacuum_into(&db.conn, &dest).unwrap();
        assert!(dest.is_file());
        let copied = Connection::open(&dest).unwrap();
        let name: String = copied
            .query_row("SELECT original_name FROM files", [], |row| row.get(0))
            .unwrap();
        assert_eq!(name, "kept.stl");
        let still: String = db
            .conn
            .query_row("SELECT original_name FROM files", [], |row| row.get(0))
            .unwrap();
        assert_eq!(still, "kept.stl");
        drop(copied);
        drop(db);
        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn replace_with_memory_db_drops_the_file_connection() {
        let (base, mut db, _) = scratch("memory");
        db.insert_file("kept.stl", "kept.stl", "stl", 3, "sha-kept", 1, None, None)
            .unwrap();
        db.conn
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
            .unwrap();
        let data = base.join("data");
        replace_with_memory_db(&mut db, &data).unwrap();
        let file: String = db
            .conn
            .query_row(
                "SELECT file FROM pragma_database_list WHERE name = 'main'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(file.is_empty(), "{file}");
        assert!(db
            .conn
            .query_row::<i64, _, _>("SELECT COUNT(*) FROM files", [], |row| row.get(0))
            .is_err());
        let check = Connection::open(data.join(DB_NAME)).unwrap();
        let name: String = check
            .query_row("SELECT original_name FROM files", [], |row| row.get(0))
            .unwrap();
        assert_eq!(name, "kept.stl");
        drop(check);
        drop(db);
        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn swap_live_catalog_replaces_the_open_database_and_settings() {
        let (base, mut db, library) = scratch("swap");
        db.insert_file("live-only.stl", "live-only.stl", "stl", 2, "live-sha", 1, None, None)
            .unwrap();
        db.conn
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
            .unwrap();
        let staged_src = base.join("staged-src");
        fs::create_dir_all(&staged_src).unwrap();
        {
            let staged = db::open(&staged_src).unwrap();
            staged
                .insert_file(
                    "from-staged.stl",
                    "from-staged.stl",
                    "stl",
                    4,
                    "staged-sha",
                    1,
                    None,
                    None,
                )
                .unwrap();
            staged
                .conn
                .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
                .unwrap();
        }
        let data = base.join("data");
        let staged_db = data.join("library.db.restore");
        fs::copy(staged_src.join(DB_NAME), &staged_db).unwrap();
        let mut thumbs = db::open(&data).unwrap();
        let mut settings = db.settings();
        settings.theme = "light".into();
        settings.library_root = Some(library.to_string_lossy().to_string());
        swap_live_catalog(&mut db, &mut thumbs, &data, &staged_db, &settings).unwrap();
        assert!(!staged_db.exists());
        let names: Vec<String> = db
            .conn
            .prepare("SELECT original_name FROM files ORDER BY original_name")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(names, vec!["from-staged.stl".to_string()]);
        assert_eq!(db.settings().theme, "light");
        assert_eq!(
            db.settings().library_root.as_deref(),
            Some(library.to_string_lossy().as_ref())
        );
        let thumb_count: i64 = thumbs
            .conn
            .query_row("SELECT COUNT(*) FROM files", [], |row| row.get(0))
            .unwrap();
        assert_eq!(thumb_count, 1);
        drop(thumbs);
        drop(db);
        let _ = fs::remove_dir_all(base);
    }
}
