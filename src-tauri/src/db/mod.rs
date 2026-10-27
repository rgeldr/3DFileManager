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
    pub mtime: i64,
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryStats {
    pub file_count: i64,
    pub folder_count: i64,
    pub size_bytes: i64,
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
    use rusqlite::Connection;

    #[test]
    fn migrate_upgrades_an_old_schema_and_is_idempotent() {
        let dir = std::env::temp_dir().join(format!("filelib-migrate-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let db_path = dir.join("library.db");
        {
            let conn = Connection::open(&db_path).unwrap();
            conn.execute_batch(
                "CREATE TABLE folders (id INTEGER PRIMARY KEY, parent_id INTEGER, name TEXT NOT NULL, relpath TEXT NOT NULL, sort_order INTEGER NOT NULL);
                 CREATE TABLE files (id INTEGER PRIMARY KEY, original_name TEXT NOT NULL, stored_relpath TEXT NOT NULL, ext TEXT NOT NULL, size_bytes INTEGER NOT NULL, sha256 TEXT NOT NULL, folder_id INTEGER, creator TEXT, tags_text TEXT NOT NULL DEFAULT '', missing INTEGER NOT NULL DEFAULT 0, thumb_status TEXT NOT NULL DEFAULT 'none', added_at INTEGER NOT NULL DEFAULT 0, modified_at INTEGER NOT NULL DEFAULT 0);
                 PRAGMA user_version = 1;",
            )
            .unwrap();
        }
        let db = open(&dir).unwrap();
        let has_attempts: bool = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('files') WHERE name = 'thumb_attempts'",
                [],
                |r| r.get::<_, i64>(0),
            )
            .map(|n| n > 0)
            .unwrap();
        assert!(has_attempts);
        let version: i32 = db
            .conn
            .pragma_query_value(None, "user_version", |r| r.get(0))
            .unwrap();
        assert!(version >= 4);
        drop(db);
        let _db2 = open(&dir).unwrap();
        let _ = std::fs::remove_dir_all(&dir);
    }

    include!("tests_listing.rs");
    include!("tests_thumbs.rs");
    include!("tests_tags.rs");
    include!("tests_tag_filter.rs");
    include!("tests_type_filter.rs");
    include!("tests_folders.rs");
    include!("tests_files.rs");
    include!("tests_stats.rs");
    include!("tests_library_move.rs");
    include!("tests_support.rs");
    include!("tests_setup.rs");
}
