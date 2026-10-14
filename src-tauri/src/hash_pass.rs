use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter};

use crate::db::AppDb;
use crate::import::hash_file;

static HASH_WORKER_RUNNING: AtomicBool = AtomicBool::new(false);

fn apply_hash_result(db: &AppDb, id: i64, path: &PathBuf) -> Result<(), String> {
    let sha = match hash_file(path) {
        Ok(sha) => sha,
        Err(_) => {
            db.set_thumb_status(id, "hash_error")?;
            return Ok(());
        }
    };
    if db.sha_exists_other(&sha, id)? {
        db.delete_files(&[id])?;
        return Ok(());
    }
    db.set_file_sha_ready(id, &sha)?;
    Ok(())
}

pub fn process_one_unhashed(db: &AppDb) -> Result<bool, String> {
    let Some(candidate) = db.claim_next_unhashed()? else {
        return Ok(false);
    };
    let root = db.library_root()?;
    let path = root.join(&candidate.stored_relpath);
    apply_hash_result(db, candidate.id, &path)?;
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
            let step = match db.lock() {
                Ok(db) => process_one_unhashed(&db),
                Err(_) => break,
            };
            match step {
                Ok(false) => break,
                Ok(true) => {}
                Err(_) => continue,
            }
        }
        HASH_WORKER_RUNNING.store(false, Ordering::SeqCst);
        let _ = app.emit("hash-pass-complete", ());
    });
}
