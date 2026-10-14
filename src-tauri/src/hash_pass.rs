use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter};

use crate::db::AppDb;
use crate::import::hash_file;

static HASH_WORKER_RUNNING: AtomicBool = AtomicBool::new(false);

/// Record a hash computed outside the database lock.
/// `Some(sha)` means the bytes duplicate another file: recycle the path, then
/// remove this catalog row. The shared thumbnail stays.
fn commit_hash(db: &AppDb, id: i64, hashed: Result<String, ()>) -> Result<Option<String>, String> {
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

fn discard_duplicate(db: &AppDb, id: i64, path: &PathBuf, sha: &str) -> Result<(), String> {
    if path.exists() {
        trash::delete(path).map_err(|err| err.to_string())?;
    }
    db.remove_catalogued_file(id, sha)
}

pub fn process_one_unhashed(db: &AppDb) -> Result<bool, String> {
    let Some(candidate) = db.claim_next_unhashed()? else {
        return Ok(false);
    };
    let root = db.library_root()?;
    let path = root.join(&candidate.stored_relpath);
    let hashed = hash_file(&path).map_err(|_| ());
    if let Some(sha) = commit_hash(db, candidate.id, hashed)? {
        discard_duplicate(db, candidate.id, &path, &sha)?;
    }
    Ok(true)
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
            let claimed = {
                let db = match db.lock() {
                    Ok(db) => db,
                    Err(_) => break,
                };
                match db.claim_next_unhashed() {
                    Ok(Some(candidate)) => match db.library_root() {
                        Ok(root) => Some((candidate.id, root.join(candidate.stored_relpath))),
                        Err(_) => None,
                    },
                    Ok(None) => None,
                    Err(_) => None,
                }
            };
            let Some((id, path)) = claimed else {
                break;
            };
            let hashed = hash_file(&path).map_err(|_| ());
            let duplicate = {
                let db = match db.lock() {
                    Ok(db) => db,
                    Err(_) => break,
                };
                commit_hash(&db, id, hashed).ok().flatten()
            };
            if let Some(sha) = duplicate {
                let _ = trash::delete(&path);
                if let Ok(db) = db.lock() {
                    let _ = db.remove_catalogued_file(id, &sha);
                }
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
}
