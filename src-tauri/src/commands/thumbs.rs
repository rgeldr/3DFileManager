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
            let _ = write_debug_log(format!(
                "thumb-decode id={} path={} error={message}",
                candidate.id,
                absolute.display()
            ));
            ThumbAction::Unavailable
        }
        Err(preview::ThumbFail::Io(message)) => {
            let _ = write_debug_log(format!(
                "thumb-io id={} path={} error={message}",
                candidate.id,
                absolute.display()
            ));
            ThumbAction::Retry
        }
    }
}

fn row_exists(db: &AppDb, id: i64) -> Result<bool, String> {
    db.file_row_exists(id)
}

fn publish_thumb(
    db: &AppDb,
    id: i64,
    sha: &str,
    bytes: &[u8],
    mut after_write: impl FnMut(&AppDb),
) -> Result<bool, String> {
    if !row_exists(db, id)? {
        return Ok(false);
    }
    let dest = db::thumb_path(&db.data_dir, sha);
    if let Err(err) = fs::write(&dest, bytes) {
        let _ = write_debug_log(format!("thumb-write id={id} error={err}"));
        db.note_thumb_io_failure(id)?;
        return Ok(false);
    }
    after_write(db);
    if !row_exists(db, id)? {
        let _ = fs::remove_file(&dest);
        return Ok(false);
    }
    db.mark_thumb_ok(id)?;
    Ok(true)
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
            if publish_thumb(db, candidate.id, &candidate.sha256, &png, |_| {})? {
                Ok(job("done"))
            } else {
                Ok(job("skip"))
            }
        }
    }
}

#[tauri::command]
async fn next_thumbnail(app: AppHandle) -> Result<Option<ThumbJob>, String> {
    let thumbs = app.state::<AppState>().thumbs.clone();
    off_ui("next_thumbnail", move || {
        let (candidate, root) = {
            let db = thumbs.lock().map_err(|e| e.to_string())?;
            let Some(candidate) = db.claim_next_pending_thumb()? else {
                return Ok(None);
            };
            let root = db.library_root()?;
            (candidate, root)
        };
        let action = classify_thumb(&root, &candidate);
        let db = thumbs.lock().map_err(|e| e.to_string())?;
        Ok(Some(apply_thumb_action(&db, &candidate, action)?))
    })
    .await
}

#[tauri::command]
async fn save_rendered_thumb(app: AppHandle, id: i64, png: Vec<u8>) -> Result<(), String> {
    let thumbs = app.state::<AppState>().thumbs.clone();
    off_ui("save_rendered_thumb", move || {
        let db = thumbs.lock().map_err(|e| e.to_string())?;
        let loc = db.file_location(id)?;
        if loc.sha256.is_empty() {
            db.set_thumb_status(id, "unhashed")?;
            return Ok(());
        }
        let Some(png) = preview::png_from_bytes(&png) else {
            db.set_thumb_status(id, "unavailable")?;
            return Ok(());
        };
        let _ = publish_thumb(&db, id, &loc.sha256, &png, |_| {})?;
        Ok(())
    })
    .await
}

#[tauri::command]
async fn mark_thumb_unavailable(app: AppHandle, id: i64) -> Result<(), String> {
    let thumbs = app.state::<AppState>().thumbs.clone();
    off_ui("mark_thumb_unavailable", move || {
        let db = thumbs.lock().map_err(|e| e.to_string())?;
        db.set_thumb_status(id, "unavailable")
    })
    .await
}

#[tauri::command]
async fn release_rendering_thumb(app: AppHandle, id: i64) -> Result<(), String> {
    let thumbs = app.state::<AppState>().thumbs.clone();
    off_ui("release_rendering_thumb", move || {
        let db = thumbs.lock().map_err(|e| e.to_string())?;
        db.release_rendering_thumb(id)
    })
    .await
}

#[tauri::command]
async fn pending_thumbnail_count(app: AppHandle) -> Result<i64, String> {
    let thumbs = app.state::<AppState>().thumbs.clone();
    off_ui("pending_thumbnail_count", move || {
        let db = thumbs.lock().map_err(|e| e.to_string())?;
        db.pending_thumb_count()
    })
    .await
}

#[tauri::command]
async fn clear_thumbnail_cache(app: AppHandle) -> Result<(), String> {
    let thumbs = app.state::<AppState>().thumbs.clone();
    off_ui("clear_thumbnail_cache", move || {
        let db = thumbs.lock().map_err(|e| e.to_string())?;
        db.clear_thumbs()
    })
    .await
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
