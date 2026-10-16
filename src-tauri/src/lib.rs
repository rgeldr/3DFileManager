mod ctb;
mod db;
mod drag_out;
mod drag_session;
#[cfg(windows)]
mod drag_win;
mod hash_pass;
mod import;
mod names;
mod preview;
mod relocate;
mod rescan;
mod settings;

use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;

use db::{AppDb, FolderFilter};
use settings::Settings;

include!("commands/runtime.rs");
include!("commands/library.rs");
include!("commands/settings.rs");
include!("commands/files.rs");
include!("commands/import_cmd.rs");
include!("commands/thumbs.rs");
include!("commands/open.rs");

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_drag::init())
        .setup(|app| {
            let dir = data_dir();
            let db = db::open(&dir).expect("open database");
            requeue_image_thumbs_once(&db);
            let thumbs = db::open(&dir).expect("open thumbnail database");
            if let Some(root) = db.settings().library_root.clone() {
                allow_asset_scope(app.handle(), PathBuf::from(&root).as_path());
            }
            allow_asset_scope(app.handle(), &dir.join("thumbs"));
            let state = AppState {
                db: Arc::new(Mutex::new(db)),
                thumbs: Arc::new(Mutex::new(thumbs)),
                import_cancel: Arc::new(AtomicBool::new(false)),
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
            set_preview_height,
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
            list_tag_counts,
            list_type_counts,
            import_paths,
            cancel_import,
            cancel_disk_op,
            recycle_paths,
            recycle_last_import,
            move_files,
            delete_files,
            rescan_library,
            next_thumbnail,
            pending_thumbnail_count,
            save_rendered_thumb,
            mark_thumb_unavailable,
            release_rendering_thumb,
            clear_thumbnail_cache,
            drag_icon_path,
            prepare_drag_paths,
            start_file_drag,
            open_in_default_app,
            reveal_file,
            text_preview,
            debug_log
        ])
        .run(tauri::generate_context!())
        .expect("error while running 3D File Library");
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::Settings;
    include!("commands/tests_thumbs.rs");
    include!("commands/tests_open.rs");
    include!("commands/tests_files.rs");
}
