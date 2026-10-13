use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter};

use crate::db::AppDb;
use crate::import::hash_file;

pub fn process_one_unhashed(db: &AppDb) -> Result<bool, String> {
    let Some(candidate) = db.next_unhashed_file()? else {
        return Ok(false);
    };
    let root = db.library_root()?;
    let path = root.join(&candidate.stored_relpath);
    let sha = match hash_file(&path) {
        Ok(sha) => sha,
        Err(err) => {
            db.drop_file_link(candidate.id)?;
            return Err(format!("{}: {err}", path.display()));
        }
    };
    if db.sha_exists_other(&sha, candidate.id)? {
        db.drop_file_link(candidate.id)?;
        return Ok(true);
    }
    db.set_file_sha_ready(candidate.id, &sha)?;
    Ok(true)
}

pub fn drain_unhashed(db: &AppDb) -> Result<u32, String> {
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
    std::thread::spawn(move || {
        loop {
            let step = {
                let guard = db.lock();
                match guard {
                    Ok(db) => process_one_unhashed(&db),
                    Err(_) => break,
                }
            };
            match step {
                Ok(true) => continue,
                Ok(false) => break,
                Err(_) => break,
            }
        }
        let _ = app.emit("hash-pass-complete", ());
    });
}
