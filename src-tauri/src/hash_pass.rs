use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter};

use crate::db::AppDb;
use crate::import::hash_file;

static HASH_WORKER_RUNNING: AtomicBool = AtomicBool::new(false);

/// Record a hash computed outside the database lock.
/// Returns `Some(sha)` when these bytes duplicate another file.
/// A moved or deleted row is left alone (moved rows go back to `unhashed`).
fn commit_if_unmoved(
    db: &AppDb,
    id: i64,
    relpath: &str,
    hashed: Result<String, ()>,
) -> Result<Option<String>, String> {
    let Ok(loc) = db.file_location(id) else {
        return Ok(None);
    };
    if loc.stored_relpath != relpath {
        db.set_thumb_status(id, "unhashed")?;
        return Ok(None);
    }
    match hashed {
        Ok(sha) => {
            if db.sha_exists_other(&sha, id)? {
                return Ok(Some(sha));
            }
            db.set_file_sha_ready(id, &sha)?;
            Ok(None)
        }
        Err(()) => {
            db.set_thumb_status(id, "hash_error")?;
            Ok(None)
        }
    }
}

fn drop_if_unmoved(db: &AppDb, id: i64, relpath: &str, sha: &str) -> Result<(), String> {
    let Ok(loc) = db.file_location(id) else {
        return Ok(());
    };
    if loc.stored_relpath != relpath {
        db.set_thumb_status(id, "unhashed")?;
        return Ok(());
    }
    db.remove_catalogued_file(id, sha)
}

#[cfg(test)]
pub fn process_one_unhashed(db: &AppDb) -> Result<bool, String> {
    let Some(candidate) = db.claim_next_unhashed()? else {
        return Ok(false);
    };
    let root = db.library_root()?;
    let path = crate::contained_library_file(&root, &candidate.stored_relpath).ok();
    let hashed = match &path {
        Some(path) => hash_file(path).map_err(|_| ()),
        None => Err(()),
    };
    if let Some(sha) = commit_if_unmoved(db, candidate.id, &candidate.stored_relpath, hashed)? {
        recycle_duplicate(db, candidate.id, &candidate.stored_relpath, &sha, &mut |path| {
            trash::delete(path).map_err(|err| err.to_string())
        })?;
    }
    Ok(true)
}

fn hash_one_released_with(
    db: &Mutex<AppDb>,
    recycle: &mut dyn FnMut(&PathBuf) -> Result<(), String>,
) -> Result<bool, String> {
    let claimed = {
        let guard = db.lock().map_err(|err| err.to_string())?;
        match guard.claim_next_unhashed()? {
            None => None,
            Some(candidate) => {
                let root = guard.library_root()?;
                let path = crate::contained_library_file(&root, &candidate.stored_relpath).ok();
                Some((candidate.id, candidate.stored_relpath.clone(), path))
            }
        }
    };
    let Some((id, relpath, path)) = claimed else {
        return Ok(false);
    };
    let hashed = match &path {
        Some(path) => hash_file(path).map_err(|_| ()),
        None => Err(()),
    };
    let duplicate = {
        let guard = db.lock().map_err(|err| err.to_string())?;
        commit_if_unmoved(&guard, id, &relpath, hashed)?
    };
    let Some(sha) = duplicate else {
        return Ok(true);
    };
    let guard = db.lock().map_err(|err| err.to_string())?;
    recycle_duplicate(&guard, id, &relpath, &sha, recycle)?;
    Ok(true)
}

/// Re-resolve the catalog path under the caller's lock, then recycle only that file.
/// A row that moved is left in place. A path that no longer stays inside the library is not deleted.
fn recycle_duplicate(
    db: &AppDb,
    id: i64,
    relpath: &str,
    sha: &str,
    recycle: &mut dyn FnMut(&PathBuf) -> Result<(), String>,
) -> Result<(), String> {
    let Ok(loc) = db.file_location(id) else {
        return Ok(());
    };
    if loc.stored_relpath != relpath {
        db.set_thumb_status(id, "unhashed")?;
        return Ok(());
    }
    let root = db.library_root()?;
    if let Ok(path) = crate::contained_library_file(&root, &loc.stored_relpath) {
        if path.exists() {
            recycle(&path)?;
        }
    }
    drop_if_unmoved(db, id, relpath, sha)
}

fn hash_one_released(db: &Mutex<AppDb>) -> Result<bool, String> {
    hash_one_released_with(db, &mut |path| trash::delete(path).map_err(|err| err.to_string()))
}

#[cfg(test)]
pub fn drain_unhashed(db: &AppDb) -> Result<u32, String> {
    db.reset_hashing_to_unhashed()?;
    let mut count = 0u32;
    while process_one_unhashed(db)? {
        count += 1;
    }
    Ok(count)
}

pub fn spawn_hash_pass_if_needed(app: AppHandle, db: Arc<Mutex<AppDb>>) {
    let pending = match db.lock() {
        Ok(db) => db.count_unhashed().unwrap_or(0),
        Err(_) => return,
    };
    if pending == 0 {
        return;
    }
    if HASH_WORKER_RUNNING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }
    std::thread::spawn(move || {
        if let Ok(db) = db.lock() {
            let _ = db.reset_hashing_to_unhashed();
        }
        loop {
            match hash_one_released(&db) {
                Ok(false) => break,
                Ok(true) => {}
                Err(_) => break,
            }
        }
        HASH_WORKER_RUNNING.store(false, Ordering::SeqCst);
        let _ = app.emit("hash-pass-complete", ());
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use crate::settings::Settings;
    use rusqlite::OptionalExtension;

    fn scratch(name: &str) -> (std::path::PathBuf, db::AppDb) {
        let dir = std::env::temp_dir().join(format!("filelib-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let db = db::open(&dir).unwrap();
        let root = dir.join("library");
        std::fs::create_dir_all(&root).unwrap();
        let mut settings = Settings::default();
        settings.library_root = Some(root.to_string_lossy().to_string());
        db.save_settings(&settings).unwrap();
        (dir, db)
    }

    #[test]
    fn missing_path_becomes_hash_error() {
        let (dir, db) = scratch("hash-miss");
        let id = db
            .insert_file_with_thumb_status("gone.stl", "gone.stl", "stl", 1, "", 1, None, None, "unhashed")
            .unwrap();
        assert!(process_one_unhashed(&db).unwrap());
        let status: String = db
            .conn
            .query_row("SELECT thumb_status FROM files WHERE id = ?1", [id], |row| row.get(0))
            .unwrap();
        assert_eq!(status, "hash_error");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn duplicate_outside_the_library_is_not_recycled() {
        let (dir, db) = scratch("hash-escape");
        let root = db.library_root().unwrap();
        std::fs::write(root.join("a.stl"), b"same-bytes").unwrap();
        let secret = dir.join("secret.stl");
        std::fs::write(&secret, b"same-bytes").unwrap();
        db.insert_file_with_thumb_status("a.stl", "a.stl", "stl", 10, "", 1, None, None, "unhashed")
            .unwrap();
        let outside = db
            .insert_file_with_thumb_status(
                "secret.stl",
                "../secret.stl",
                "stl",
                10,
                "",
                1,
                None,
                None,
                "unhashed",
            )
            .unwrap();
        assert!(process_one_unhashed(&db).unwrap());
        assert!(process_one_unhashed(&db).unwrap());
        assert!(secret.is_file());
        assert!(db.file_row_exists(outside).unwrap());
        let status: String = db
            .conn
            .query_row(
                "SELECT thumb_status FROM files WHERE id = ?1",
                [outside],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(status, "hash_error");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn duplicate_content_drops_the_second_file() {
        let (dir, db) = scratch("hash-dup");
        let root = db.library_root().unwrap();
        std::fs::write(root.join("a.stl"), b"same-bytes").unwrap();
        std::fs::write(root.join("b.stl"), b"same-bytes").unwrap();
        let first = db
            .insert_file_with_thumb_status("a.stl", "a.stl", "stl", 10, "", 1, None, None, "unhashed")
            .unwrap();
        let second = db
            .insert_file_with_thumb_status("b.stl", "b.stl", "stl", 10, "", 1, None, None, "unhashed")
            .unwrap();
        assert!(process_one_unhashed(&db).unwrap());
        assert!(process_one_unhashed(&db).unwrap());
        let count: i64 = db.conn.query_row("SELECT COUNT(*) FROM files", [], |row| row.get(0)).unwrap();
        assert_eq!(count, 1);
        let kept: i64 = db.conn.query_row("SELECT id FROM files", [], |row| row.get(0)).unwrap();
        assert_eq!(kept, first);
        let status: String = db
            .conn
            .query_row("SELECT thumb_status FROM files WHERE id = ?1", [kept], |row| row.get(0))
            .unwrap();
        assert_eq!(status, "none");
        let gone = db
            .conn
            .query_row::<i64, _, _>("SELECT id FROM files WHERE id = ?1", [second], |row| row.get(0))
            .optional()
            .unwrap();
        assert!(gone.is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn failed_recycle_keeps_the_duplicate_row() {
        let (dir, db) = scratch("hash-trash-fail");
        let root = db.library_root().unwrap();
        std::fs::write(root.join("a.stl"), b"same-bytes").unwrap();
        std::fs::write(root.join("b.stl"), b"same-bytes").unwrap();
        let first = db
            .insert_file_with_thumb_status("a.stl", "a.stl", "stl", 10, "", 1, None, None, "unhashed")
            .unwrap();
        let second = db
            .insert_file_with_thumb_status("b.stl", "b.stl", "stl", 10, "", 1, None, None, "unhashed")
            .unwrap();
        let db = Mutex::new(db);
        assert!(hash_one_released_with(&db, &mut |_| Ok(())).unwrap());
        let failed = hash_one_released_with(&db, &mut |_| Err("recycle denied".into()));
        assert!(failed.is_err());
        let db = db.lock().unwrap();
        let count: i64 = db.conn.query_row("SELECT COUNT(*) FROM files", [], |row| row.get(0)).unwrap();
        assert_eq!(count, 2);
        let status: String = db
            .conn
            .query_row("SELECT thumb_status FROM files WHERE id = ?1", [second], |row| row.get(0))
            .unwrap();
        assert_eq!(status, "hashing");
        let kept: i64 = db
            .conn
            .query_row("SELECT id FROM files WHERE id = ?1", [first], |row| row.get(0))
            .unwrap();
        assert_eq!(kept, first);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn moved_file_is_requeued_instead_of_storing_the_old_hash() {
        let (dir, db) = scratch("hash-moved");
        let root = db.library_root().unwrap();
        std::fs::write(root.join("a.stl"), b"bytes").unwrap();
        let id = db
            .insert_file_with_thumb_status("a.stl", "a.stl", "stl", 5, "", 1, None, None, "hashing")
            .unwrap();
        db.update_path(id, "moved/a.stl", None, 5, 2).unwrap();
        let outcome = commit_if_unmoved(&db, id, "a.stl", Ok("deadbeef".into())).unwrap();
        assert!(outcome.is_none());
        let sha: String = db
            .conn
            .query_row("SELECT sha256 FROM files WHERE id = ?1", [id], |row| row.get(0))
            .unwrap();
        assert!(sha.is_empty());
        let status: String = db
            .conn
            .query_row("SELECT thumb_status FROM files WHERE id = ?1", [id], |row| row.get(0))
            .unwrap();
        assert_eq!(status, "unhashed");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn duplicate_recycle_skips_a_row_that_moved_and_refuses_an_outside_path() {
        let (dir, db) = scratch("hash-recycle-check");
        let root = db.library_root().unwrap();
        std::fs::write(root.join("b.stl"), b"same-bytes").unwrap();
        let id = db
            .insert_file_with_thumb_status("b.stl", "b.stl", "stl", 10, "", 1, None, None, "hashing")
            .unwrap();
        db.update_path(id, "moved/b.stl", None, 10, 2).unwrap();
        let mut recycled = false;
        recycle_duplicate(&db, id, "b.stl", "abc", &mut |_| {
            recycled = true;
            Ok(())
        })
        .unwrap();
        assert!(!recycled);
        assert!(root.join("b.stl").is_file());
        assert!(db.file_row_exists(id).unwrap());
        let status: String = db
            .conn
            .query_row("SELECT thumb_status FROM files WHERE id = ?1", [id], |row| row.get(0))
            .unwrap();
        assert_eq!(status, "unhashed");

        let secret = dir.join("secret.stl");
        std::fs::write(&secret, b"same-bytes").unwrap();
        let outside = db
            .insert_file_with_thumb_status(
                "secret.stl",
                "../secret.stl",
                "stl",
                10,
                "",
                1,
                None,
                None,
                "hashing",
            )
            .unwrap();
        recycle_duplicate(&db, outside, "../secret.stl", "abc", &mut |_| {
            recycled = true;
            Ok(())
        })
        .unwrap();
        assert!(!recycled);
        assert!(secret.is_file());
        assert!(!db.file_row_exists(outside).unwrap());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
