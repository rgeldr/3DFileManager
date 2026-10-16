use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::time::Duration;

use rusqlite::{params, params_from_iter, Connection, OptionalExtension};
use serde::Serialize;

use crate::names::{default_sort_name, unique_dir_name};
use crate::relocate::{self, DiskProgress, TreeMove};
use crate::settings::{self, Settings};

pub struct AppDb {
    pub conn: Connection,
    pub data_dir: PathBuf,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderRow {
    pub id: i64,
    pub parent_id: Option<i64>,
    pub name: String,
    pub relpath: String,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileRow {
    pub id: i64,
    pub original_name: String,
    pub sort_name: String,
    pub stored_relpath: String,
    pub ext: String,
    pub size_bytes: i64,
    pub sha256: String,
    pub folder_id: Option<i64>,
    pub creator: String,
    pub notes: String,
    pub source_archive: Option<String>,
    pub imported_at: i64,
    pub thumb_status: String,
    pub missing: bool,
    pub tags: Vec<String>,
    pub absolute_path: String,
    pub thumb_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bootstrap {
    pub settings: Settings,
    pub folders: Vec<FolderRow>,
    pub missing_count: i64,
}

include!("schema.rs");

pub fn open(data_dir: &Path) -> Result<AppDb, String> {
    std::fs::create_dir_all(data_dir).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(data_dir.join("thumbs")).map_err(|e| e.to_string())?;
    let conn = Connection::open(data_dir.join("library.db")).map_err(|e| e.to_string())?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| e.to_string())?;
    conn.busy_timeout(Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    migrate(&conn)?;
    Ok(AppDb {
        conn,
        data_dir: data_dir.to_path_buf(),
    })
}

include!("setup.rs");
include!("folders.rs");
include!("files.rs");
include!("listing.rs");
include!("tags.rs");
include!("thumbs.rs");
include!("rows.rs");

#[cfg(test)]
mod tests {
    use super::*;
    include!("tests_listing.rs");
    include!("tests_thumbs.rs");
    include!("tests_tags.rs");
    include!("tests_tag_filter.rs");
    include!("tests_type_filter.rs");
    include!("tests_folders.rs");
    include!("tests_files.rs");
    include!("tests_library_move.rs");
    include!("tests_support.rs");
}
