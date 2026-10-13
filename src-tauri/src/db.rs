use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

use crate::names::{default_sort_name, sanitize_component, unique_dir_name};
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

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS folders (
    id INTEGER PRIMARY KEY,
    parent_id INTEGER REFERENCES folders(id),
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    relpath TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY,
    original_name TEXT NOT NULL,
    sort_name TEXT NOT NULL,
    stored_relpath TEXT NOT NULL UNIQUE,
    ext TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    mtime INTEGER NOT NULL,
    folder_id INTEGER REFERENCES folders(id),
    creator TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    source_archive TEXT,
    imported_at INTEGER NOT NULL,
    thumb_status TEXT NOT NULL DEFAULT 'none',
    missing INTEGER NOT NULL DEFAULT 0,
    tags_text TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE
);
CREATE TABLE IF NOT EXISTS file_tags (
    file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (file_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_files_sha ON files(sha256);
CREATE INDEX IF NOT EXISTS idx_files_folder ON files(folder_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);
CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
    sort_name,
    original_name,
    creator,
    notes,
    tags_text,
    content='files',
    content_rowid='id',
    tokenize = "unicode61 remove_diacritics 2"
);
CREATE TRIGGER IF NOT EXISTS files_ai AFTER INSERT ON files BEGIN
    INSERT INTO files_fts(rowid, sort_name, original_name, creator, notes, tags_text)
    VALUES (new.id, new.sort_name, new.original_name, new.creator, new.notes, new.tags_text);
END;
CREATE TRIGGER IF NOT EXISTS files_ad AFTER DELETE ON files BEGIN
    INSERT INTO files_fts(files_fts, rowid, sort_name, original_name, creator, notes, tags_text)
    VALUES ('delete', old.id, old.sort_name, old.original_name, old.creator, old.notes, old.tags_text);
END;
CREATE TRIGGER IF NOT EXISTS files_au AFTER UPDATE ON files BEGIN
    INSERT INTO files_fts(files_fts, rowid, sort_name, original_name, creator, notes, tags_text)
    VALUES ('delete', old.id, old.sort_name, old.original_name, old.creator, old.notes, old.tags_text);
    INSERT INTO files_fts(rowid, sort_name, original_name, creator, notes, tags_text)
    VALUES (new.id, new.sort_name, new.original_name, new.creator, new.notes, new.tags_text);
END;
"#;

pub fn open(data_dir: &Path) -> Result<AppDb, String> {
    std::fs::create_dir_all(data_dir).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(data_dir.join("thumbs")).map_err(|e| e.to_string())?;
    let conn = Connection::open(data_dir.join("library.db")).map_err(|e| e.to_string())?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| e.to_string())?;
    let version: i32 = conn
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if version < 1 {
        conn.execute_batch(SCHEMA).map_err(|e| e.to_string())?;
        conn.pragma_update(None, "user_version", 1)
            .map_err(|e| e.to_string())?;
    }
    conn.execute(
        "UPDATE files SET thumb_status = 'none' WHERE thumb_status = 'rendering'",
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(AppDb {
        conn,
        data_dir: data_dir.to_path_buf(),
    })
}

impl AppDb {
    pub fn settings(&self) -> Settings {
        settings::load(&self.data_dir)
    }

    pub fn save_settings(&self, settings: &Settings) -> Result<(), String> {
        settings::save(&self.data_dir, settings)
    }

    pub fn library_root(&self) -> Result<PathBuf, String> {
        self.settings()
            .library_root
            .map(PathBuf::from)
            .ok_or_else(|| "Choose a library folder first.".to_string())
    }

    pub fn bootstrap(&self) -> Result<Bootstrap, String> {
        let settings = self.settings();
        let folders = self.list_folders()?;
        let missing_count: i64 = self
            .conn
            .query_row("SELECT COUNT(*) FROM files WHERE missing = 1", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        Ok(Bootstrap {
            settings,
            folders,
            missing_count,
        })
    }

    pub fn set_library_root(&self, path: &Path) -> Result<Bootstrap, String> {
        let mut settings = self.settings();
        if settings.library_root.is_some() {
            return Err("The library folder is already set.".into());
        }
        if !path.is_dir() {
            return Err("Pick an existing folder.".into());
        }
        let canonical = path.canonicalize().map_err(|e| e.to_string())?;
        settings.library_root = Some(canonical.to_string_lossy().to_string());
        self.save_settings(&settings)?;
        self.seed_default_folders()?;
        self.bootstrap()
    }

    pub fn seed_default_folders(&self) -> Result<(), String> {
        let count: i64 = self
            .conn
            .query_row("SELECT COUNT(*) FROM folders", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if count > 0 {
            return Ok(());
        }
        for (order, name) in ["FDM Prints", "Models", "Wargaming Terrain"]
            .iter()
            .enumerate()
        {
            self.create_folder(None, name, order as i64)?;
        }
        Ok(())
    }

    pub fn list_folders(&self) -> Result<Vec<FolderRow>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, parent_id, name, relpath, sort_order FROM folders ORDER BY sort_order, name COLLATE NOCASE",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok(FolderRow {
                    id: r.get(0)?,
                    parent_id: r.get(1)?,
                    name: r.get(2)?,
                    relpath: r.get(3)?,
                    sort_order: r.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn create_folder(
        &self,
        parent_id: Option<i64>,
        name: &str,
        sort_order: i64,
    ) -> Result<FolderRow, String> {
        let root = self.library_root()?;
        let parent_rel = if let Some(id) = parent_id {
            Some(self.folder_relpath(id)?)
        } else {
            None
        };
        let parent_dir = match &parent_rel {
            Some(rel) => root.join(rel),
            None => root.clone(),
        };
        std::fs::create_dir_all(&parent_dir).map_err(|e| e.to_string())?;
        let unique = unique_dir_name(&parent_dir, name);
        let relpath = match &parent_rel {
            Some(rel) => format!("{rel}/{unique}"),
            None => unique.clone(),
        };
        std::fs::create_dir_all(root.join(&relpath)).map_err(|e| e.to_string())?;
        self.conn
            .execute(
                "INSERT INTO folders (parent_id, name, sort_order, relpath) VALUES (?1, ?2, ?3, ?4)",
                params![parent_id, unique, sort_order, relpath],
            )
            .map_err(|e| e.to_string())?;
        let id = self.conn.last_insert_rowid();
        Ok(FolderRow {
            id,
            parent_id,
            name: unique,
            relpath,
            sort_order,
        })
    }

    pub fn rename_folder(&self, id: i64, new_name: &str) -> Result<(), String> {
        let root = self.library_root()?;
        let old_rel = self.folder_relpath(id)?;
        let parent_id: Option<i64> = self
            .conn
            .query_row("SELECT parent_id FROM folders WHERE id = ?1", [id], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        let parent_dir = match parent_id {
            Some(pid) => root.join(self.folder_relpath(pid)?),
            None => root.clone(),
        };
        let unique = unique_dir_name(&parent_dir, new_name);
        let new_rel = match old_rel.rsplit_once('/') {
            Some((parent, _)) => format!("{parent}/{unique}"),
            None => unique.clone(),
        };
        let from = root.join(&old_rel);
        let to = root.join(&new_rel);
        if from != to {
            std::fs::rename(&from, &to).map_err(|e| e.to_string())?;
        }
        let folders = self.list_folders()?;
        for folder in folders {
            if folder.relpath == old_rel || folder.relpath.starts_with(&(old_rel.clone() + "/")) {
                let updated = if folder.relpath == old_rel {
                    new_rel.clone()
                } else {
                    format!("{new_rel}{}", &folder.relpath[old_rel.len()..])
                };
                let name = if folder.id == id {
                    unique.clone()
                } else {
                    folder.name
                };
                self.conn
                    .execute(
                        "UPDATE folders SET relpath = ?1, name = ?2 WHERE id = ?3",
                        params![updated, name, folder.id],
                    )
                    .map_err(|e| e.to_string())?;
            }
        }
        let mut stmt = self
            .conn
            .prepare("SELECT id, stored_relpath FROM files")
            .map_err(|e| e.to_string())?;
        let files: Vec<(i64, String)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        drop(stmt);
        for (fid, rel) in files {
            if rel == old_rel || rel.starts_with(&(old_rel.clone() + "/")) {
                let updated = format!("{new_rel}{}", &rel[old_rel.len()..]);
                self.conn
                    .execute(
                        "UPDATE files SET stored_relpath = ?1 WHERE id = ?2",
                        params![updated, fid],
                    )
                    .map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }

    pub fn move_folder(&self, id: i64, new_parent_id: Option<i64>) -> Result<(), String> {
        let current_parent: Option<i64> = self
            .conn
            .query_row("SELECT parent_id FROM folders WHERE id = ?1", [id], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if current_parent == new_parent_id {
            return Ok(());
        }
        if new_parent_id == Some(id) {
            return Err("Cannot move a folder into itself or its subfolder.".into());
        }
        let mut walk = new_parent_id;
        while let Some(pid) = walk {
            if pid == id {
                return Err("Cannot move a folder into itself or its subfolder.".into());
            }
            walk = self
                .conn
                .query_row("SELECT parent_id FROM folders WHERE id = ?1", [pid], |r| r.get(0))
                .map_err(|e| e.to_string())?;
        }

        let root = self.library_root()?;
        let old_rel = self.folder_relpath(id)?;
        let name: String = self
            .conn
            .query_row("SELECT name FROM folders WHERE id = ?1", [id], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        let parent_dir = match new_parent_id {
            Some(pid) => root.join(self.folder_relpath(pid)?),
            None => root.clone(),
        };
        std::fs::create_dir_all(&parent_dir).map_err(|e| e.to_string())?;
        let unique = unique_dir_name(&parent_dir, &name);
        let dest_rel_prefix = match new_parent_id {
            Some(pid) => self.folder_relpath(pid)?,
            None => String::new(),
        };
        let new_rel = if dest_rel_prefix.is_empty() {
            unique.clone()
        } else {
            format!("{dest_rel_prefix}/{unique}")
        };
        let from = root.join(&old_rel);
        let to = root.join(&new_rel);
        if from != to {
            std::fs::rename(&from, &to).map_err(|e| e.to_string())?;
        }
        let folders = self.list_folders()?;
        let old_prefix = format!("{old_rel}/");
        for folder in folders {
            if folder.relpath == old_rel || folder.relpath.starts_with(&old_prefix) {
                let updated = if folder.relpath == old_rel {
                    new_rel.clone()
                } else {
                    format!("{new_rel}{}", &folder.relpath[old_rel.len()..])
                };
                let row_name = if folder.id == id {
                    unique.clone()
                } else {
                    folder.name
                };
                if folder.id == id {
                    self.conn
                        .execute(
                            "UPDATE folders SET parent_id = ?1, relpath = ?2, name = ?3 WHERE id = ?4",
                            params![new_parent_id, updated, row_name, folder.id],
                        )
                        .map_err(|e| e.to_string())?;
                } else {
                    self.conn
                        .execute(
                            "UPDATE folders SET relpath = ?1, name = ?2 WHERE id = ?3",
                            params![updated, row_name, folder.id],
                        )
                        .map_err(|e| e.to_string())?;
                }
            }
        }
        let mut stmt = self
            .conn
            .prepare("SELECT id, stored_relpath FROM files")
            .map_err(|e| e.to_string())?;
        let files: Vec<(i64, String)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        drop(stmt);
        for (fid, rel) in files {
            if rel == old_rel || rel.starts_with(&old_prefix) {
                let updated = format!("{new_rel}{}", &rel[old_rel.len()..]);
                self.conn
                    .execute(
                        "UPDATE files SET stored_relpath = ?1 WHERE id = ?2",
                        params![updated, fid],
                    )
                    .map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }

    pub fn delete_folder(&self, id: i64) -> Result<(), String> {
        let child: i64 = self
            .conn
            .query_row(
                "SELECT COUNT(*) FROM folders WHERE parent_id = ?1",
                [id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        let files: i64 = self
            .conn
            .query_row(
                "SELECT COUNT(*) FROM files WHERE folder_id = ?1",
                [id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if child > 0 || files > 0 {
            return Err("Folder is not empty.".into());
        }
        let root = self.library_root()?;
        let rel = self.folder_relpath(id)?;
        let dir = root.join(&rel);
        if dir.exists() {
            std::fs::remove_dir(&dir).map_err(|e| e.to_string())?;
        }
        self.conn
            .execute("DELETE FROM folders WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn folder_relpath(&self, id: i64) -> Result<String, String> {
        self.conn
            .query_row("SELECT relpath FROM folders WHERE id = ?1", [id], |r| r.get(0))
            .map_err(|_| format!("Folder {id} was not found."))
    }

    pub fn folder_id_by_relpath(&self, relpath: &str) -> Result<Option<i64>, String> {
        self.conn
            .query_row(
                "SELECT id FROM folders WHERE relpath = ?1",
                [relpath],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())
    }

    pub fn ensure_folder_chain(&self, parent_id: Option<i64>, relative_dir: &Path) -> Result<Option<i64>, String> {
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
                Some(id) => Some(self.folder_relpath(id)?),
                None => None,
            };
            let relpath = match &parent_rel {
                Some(rel) => format!("{rel}/{name}"),
                None => name.clone(),
            };
            if let Some(id) = self.folder_id_by_relpath(&relpath)? {
                current = Some(id);
                continue;
            }
            let root = self.library_root()?;
            std::fs::create_dir_all(root.join(&relpath)).map_err(|e| e.to_string())?;
            self.conn
                .execute(
                    "INSERT INTO folders (parent_id, name, sort_order, relpath) VALUES (?1, ?2, 0, ?3)",
                    params![current, name, relpath],
                )
                .map_err(|e| e.to_string())?;
            current = Some(self.conn.last_insert_rowid());
        }
        Ok(current)
    }

    pub fn sha_exists(&self, sha: &str) -> Result<bool, String> {
        if sha.is_empty() {
            return Ok(false);
        }
        let count: i64 = self
            .conn
            .query_row(
                "SELECT COUNT(*) FROM files WHERE sha256 = ?1 AND missing = 0",
                [sha],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        Ok(count > 0)
    }

    pub fn sha_exists_other(&self, sha: &str, exclude_id: i64) -> Result<bool, String> {
        if sha.is_empty() {
            return Ok(false);
        }
        let count: i64 = self
            .conn
            .query_row(
                "SELECT COUNT(*) FROM files WHERE sha256 = ?1 AND missing = 0 AND id <> ?2",
                params![sha, exclude_id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        Ok(count > 0)
    }

    pub fn insert_file(
        &self,
        original_name: &str,
        stored_relpath: &str,
        ext: &str,
        size_bytes: i64,
        sha256: &str,
        mtime: i64,
        folder_id: Option<i64>,
        source_archive: Option<&str>,
    ) -> Result<i64, String> {
        self.insert_file_with_thumb_status(
            original_name,
            stored_relpath,
            ext,
            size_bytes,
            sha256,
            mtime,
            folder_id,
            source_archive,
            "none",
        )
    }

    pub fn insert_file_with_thumb_status(
        &self,
        original_name: &str,
        stored_relpath: &str,
        ext: &str,
        size_bytes: i64,
        sha256: &str,
        mtime: i64,
        folder_id: Option<i64>,
        source_archive: Option<&str>,
        thumb_status: &str,
    ) -> Result<i64, String> {
        let sort_name = default_sort_name(original_name);
        let now = chrono_now();
        self.conn
            .execute(
                "INSERT INTO files (original_name, sort_name, stored_relpath, ext, size_bytes, sha256, mtime, folder_id, creator, notes, source_archive, imported_at, thumb_status, missing)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, '', '', ?9, ?10, ?11, 0)",
                params![
                    original_name,
                    sort_name,
                    stored_relpath,
                    ext,
                    size_bytes,
                    sha256,
                    mtime,
                    folder_id,
                    source_archive,
                    now,
                    thumb_status
                ],
            )
            .map_err(|e| e.to_string())?;
        let id = self.conn.last_insert_rowid();
        Ok(id)
    }

    pub fn import_batch_begin(&mut self) -> Result<(), String> {
        self.conn
            .pragma_update(None, "synchronous", "NORMAL")
            .map_err(|e| e.to_string())?;
        self.conn
            .execute_batch("BEGIN IMMEDIATE;")
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn import_batch_commit(&mut self) -> Result<(), String> {
        self.conn.execute_batch("COMMIT;").map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn import_batch_rollback(&mut self) -> Result<(), String> {
        self.conn.execute_batch("ROLLBACK;").map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn is_autocommit(&self) -> bool {
        self.conn.is_autocommit()
    }

    pub fn next_unhashed_file(&self) -> Result<Option<UnhashedCandidate>, String> {
        self.conn
            .query_row(
                "SELECT id, stored_relpath FROM files WHERE thumb_status = 'unhashed' AND missing = 0 ORDER BY id LIMIT 1",
                [],
                |r| {
                    Ok(UnhashedCandidate {
                        id: r.get(0)?,
                        stored_relpath: r.get(1)?,
                    })
                },
            )
            .optional()
            .map_err(|e| e.to_string())
    }

    pub fn claim_next_unhashed(&self) -> Result<Option<UnhashedCandidate>, String> {
        let Some(candidate) = self.next_unhashed_file()? else {
            return Ok(None);
        };
        self.set_thumb_status(candidate.id, "hashing")?;
        Ok(Some(candidate))
    }

    pub fn reset_hashing_to_unhashed(&self) -> Result<(), String> {
        self.conn
            .execute(
                "UPDATE files SET thumb_status = 'unhashed' WHERE thumb_status = 'hashing'",
                [],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn set_file_sha_ready(&self, id: i64, sha256: &str) -> Result<(), String> {
        self.conn
            .execute(
                "UPDATE files SET sha256 = ?1, thumb_status = 'none' WHERE id = ?2",
                params![sha256, id],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn drop_file_link(&self, id: i64) -> Result<(), String> {
        let loc = self.file_location(id)?;
        let root = self.library_root()?;
        let path = root.join(&loc.stored_relpath);
        if path.exists() {
            std::fs::remove_file(&path).map_err(|e| e.to_string())?;
        }
        self.conn
            .execute("DELETE FROM files WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn count_unhashed(&self) -> Result<i64, String> {
        self.conn
            .query_row(
                "SELECT COUNT(*) FROM files WHERE thumb_status = 'unhashed' AND missing = 0",
                [],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())
    }

    pub fn sync_tags_text(&self, id: i64) -> Result<(), String> {
        let tags = self.tag_string(id)?;
        self.conn
            .execute("UPDATE files SET tags_text = ?1 WHERE id = ?2", params![tags, id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    fn tag_string(&self, id: i64) -> Result<String, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT t.name FROM tags t JOIN file_tags ft ON ft.tag_id = t.id WHERE ft.file_id = ?1 ORDER BY t.name",
            )
            .map_err(|e| e.to_string())?;
        let names = stmt
            .query_map([id], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        Ok(names.join(" "))
    }

    pub fn list_files(
        &self,
        folder: FolderFilter,
        query: &str,
        creator: &str,
        tag: &str,
        sort: &str,
    ) -> Result<Vec<FileRow>, String> {
        let root = self.library_root().unwrap_or_default();
        let fts = fts_match(query);
        let mut sql = String::from(
            "SELECT f.id, f.original_name, f.sort_name, f.stored_relpath, f.ext, f.size_bytes, f.sha256, f.folder_id, f.creator, f.notes, f.source_archive, f.imported_at, f.thumb_status, f.missing
             FROM files f",
        );
        if fts.is_some() {
            sql.push_str(" JOIN files_fts ON files_fts.rowid = f.id");
        }
        sql.push_str(" WHERE f.missing = 0");
        let mut param_values: Vec<String> = Vec::new();
        match folder {
            FolderFilter::All => {}
            FolderFilter::Root => sql.push_str(" AND f.folder_id IS NULL"),
            FolderFilter::Id(id) => {
                sql.push_str(" AND f.folder_id = ?");
                param_values.push(id.to_string());
            }
        }
        if !creator.is_empty() {
            sql.push_str(" AND f.creator = ? COLLATE NOCASE");
            param_values.push(creator.to_string());
        }
        if !tag.is_empty() {
            sql.push_str(
                " AND EXISTS (SELECT 1 FROM file_tags ft JOIN tags t ON t.id = ft.tag_id WHERE ft.file_id = f.id AND t.name = ? COLLATE NOCASE)",
            );
            param_values.push(tag.to_string());
        }
        if let Some(match_q) = &fts {
            sql.push_str(" AND files_fts MATCH ?");
            param_values.push(match_q.clone());
        }
        sql.push_str(match sort {
            "creator" => " ORDER BY f.creator COLLATE NOCASE, f.sort_name COLLATE NOCASE",
            "date" => " ORDER BY f.imported_at DESC, f.sort_name COLLATE NOCASE",
            _ => " ORDER BY f.sort_name COLLATE NOCASE",
        });
        let mut stmt = self.conn.prepare(&sql).map_err(|e| e.to_string())?;
        let params_ref: Vec<&dyn rusqlite::ToSql> = param_values
            .iter()
            .map(|s| s as &dyn rusqlite::ToSql)
            .collect();
        let rows = stmt
            .query_map(params_ref.as_slice(), |r| {
                Ok(FileSeed {
                    id: r.get(0)?,
                    original_name: r.get(1)?,
                    sort_name: r.get(2)?,
                    stored_relpath: r.get(3)?,
                    ext: r.get(4)?,
                    size_bytes: r.get(5)?,
                    sha256: r.get(6)?,
                    folder_id: r.get(7)?,
                    creator: r.get(8)?,
                    notes: r.get(9)?,
                    source_archive: r.get(10)?,
                    imported_at: r.get(11)?,
                    thumb_status: r.get(12)?,
                    missing: r.get::<_, i64>(13)? != 0,
                })
            })
            .map_err(|e| e.to_string())?;
        let seeds = rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
        drop(stmt);
        let ids: Vec<i64> = seeds.iter().map(|s| s.id).collect();
        let tag_map = self.tags_for_ids(&ids)?;
        let mut out = Vec::new();
        for seed in seeds {
            let tags = tag_map.get(&seed.id).cloned().unwrap_or_default();
            out.push(self.hydrate_with_tags(seed, &root, tags)?);
        }
        Ok(out)
    }

    pub fn missing_files(&self) -> Result<Vec<FileRow>, String> {
        let root = self.library_root().unwrap_or_default();
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, original_name, sort_name, stored_relpath, ext, size_bytes, sha256, folder_id, creator, notes, source_archive, imported_at, thumb_status, missing FROM files WHERE missing = 1 ORDER BY sort_name COLLATE NOCASE",
            )
            .map_err(|e| e.to_string())?;
        let seeds = stmt
            .query_map([], |r| {
                Ok(FileSeed {
                    id: r.get(0)?,
                    original_name: r.get(1)?,
                    sort_name: r.get(2)?,
                    stored_relpath: r.get(3)?,
                    ext: r.get(4)?,
                    size_bytes: r.get(5)?,
                    sha256: r.get(6)?,
                    folder_id: r.get(7)?,
                    creator: r.get(8)?,
                    notes: r.get(9)?,
                    source_archive: r.get(10)?,
                    imported_at: r.get(11)?,
                    thumb_status: r.get(12)?,
                    missing: r.get::<_, i64>(13)? != 0,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        drop(stmt);
        let ids: Vec<i64> = seeds.iter().map(|s| s.id).collect();
        let tag_map = self.tags_for_ids(&ids)?;
        seeds
            .into_iter()
            .map(|s| {
                let tags = tag_map.get(&s.id).cloned().unwrap_or_default();
                self.hydrate_with_tags(s, &root, tags)
            })
            .collect()
    }

    fn hydrate(&self, seed: FileSeed, root: &Path) -> Result<FileRow, String> {
        let tags = self.tags_for(seed.id)?;
        self.hydrate_with_tags(seed, root, tags)
    }

    fn hydrate_with_tags(
        &self,
        seed: FileSeed,
        root: &Path,
        tags: Vec<String>,
    ) -> Result<FileRow, String> {
        let absolute = root.join(&seed.stored_relpath);
        let thumb = thumb_path(&self.data_dir, &seed.sha256);
        let thumb_path = if seed.thumb_status == "ok" && thumb.exists() {
            Some(thumb.to_string_lossy().to_string())
        } else {
            None
        };
        Ok(FileRow {
            id: seed.id,
            original_name: seed.original_name,
            sort_name: seed.sort_name,
            stored_relpath: seed.stored_relpath,
            ext: seed.ext,
            size_bytes: seed.size_bytes,
            sha256: seed.sha256,
            folder_id: seed.folder_id,
            creator: seed.creator,
            notes: seed.notes,
            source_archive: seed.source_archive,
            imported_at: seed.imported_at,
            thumb_status: seed.thumb_status,
            missing: seed.missing,
            tags,
            absolute_path: absolute.to_string_lossy().to_string(),
            thumb_path,
        })
    }

    fn tags_for(&self, id: i64) -> Result<Vec<String>, String> {
        let mut map = self.tags_for_ids(&[id])?;
        Ok(map.remove(&id).unwrap_or_default())
    }

    fn tags_for_ids_chunk(
        &self,
        ids: &[i64],
        out: &mut std::collections::HashMap<i64, Vec<String>>,
    ) -> Result<(), String> {
        if ids.is_empty() {
            return Ok(());
        }
        let placeholders = ids
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!(
            "SELECT ft.file_id, t.name FROM tags t JOIN file_tags ft ON ft.tag_id = t.id WHERE ft.file_id IN ({placeholders}) ORDER BY t.name COLLATE NOCASE"
        );
        let mut stmt = self.conn.prepare(&sql).map_err(|e| e.to_string())?;
        let params: Vec<&dyn rusqlite::ToSql> = ids.iter().map(|id| id as &dyn rusqlite::ToSql).collect();
        let rows = stmt
            .query_map(params.as_slice(), |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        for (file_id, name) in rows {
            out.entry(file_id).or_default().push(name);
        }
        Ok(())
    }

    fn tags_for_ids(&self, ids: &[i64]) -> Result<std::collections::HashMap<i64, Vec<String>>, String> {
        use std::collections::HashMap;
        let mut out: HashMap<i64, Vec<String>> = HashMap::new();
        if ids.is_empty() {
            return Ok(out);
        }
        const CHUNK: usize = 500;
        for chunk in ids.chunks(CHUNK) {
            self.tags_for_ids_chunk(chunk, &mut out)?;
        }
        Ok(out)
    }

    pub fn update_file(
        &self,
        id: i64,
        sort_name: &str,
        creator: &str,
        notes: &str,
        folder_id: Option<i64>,
    ) -> Result<(), String> {
        let current = self.file_location(id)?;
        if current.folder_id != folder_id {
            self.move_files(&[id], folder_id)?;
        }
        self.conn
            .execute(
                "UPDATE files SET sort_name = ?1, creator = ?2, notes = ?3 WHERE id = ?4",
                params![sort_name.trim(), creator.trim(), notes, id],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn set_tags(&self, id: i64, tags: &[String]) -> Result<(), String> {
        self.conn
            .execute("DELETE FROM file_tags WHERE file_id = ?1", [id])
            .map_err(|e| e.to_string())?;
        for tag in tags {
            let name = tag.trim();
            if name.is_empty() {
                continue;
            }
            self.conn
                .execute("INSERT INTO tags (name) VALUES (?1) ON CONFLICT(name) DO NOTHING", [name])
                .map_err(|e| e.to_string())?;
            let tag_id: i64 = self
                .conn
                .query_row(
                    "SELECT id FROM tags WHERE name = ?1 COLLATE NOCASE",
                    [name],
                    |r| r.get(0),
                )
                .map_err(|e| e.to_string())?;
            self.conn
                .execute(
                    "INSERT OR IGNORE INTO file_tags (file_id, tag_id) VALUES (?1, ?2)",
                    params![id, tag_id],
                )
                .map_err(|e| e.to_string())?;
        }
        self.sync_tags_text(id)?;
        Ok(())
    }

    pub fn add_tags_under_folder(&self, folder_id: Option<i64>, tags: &[String]) -> Result<i64, String> {
        let names: Vec<String> = tags
            .iter()
            .map(|t| t.trim())
            .filter(|t| !t.is_empty())
            .map(|t| t.to_string())
            .collect();
        let file_ids = self.file_ids_under_folder(folder_id)?;
        if names.is_empty() {
            return Ok(file_ids.len() as i64);
        }
        let tx = self.conn.unchecked_transaction().map_err(|e| e.to_string())?;
        let tag_ids: Vec<i64> = names
            .iter()
            .map(|name| self.ensure_tag_id(name))
            .collect::<Result<Vec<_>, _>>()?;
        for file_id in &file_ids {
            for tag_id in &tag_ids {
                tx.execute(
                    "INSERT OR IGNORE INTO file_tags (file_id, tag_id) VALUES (?1, ?2)",
                    params![file_id, tag_id],
                )
                .map_err(|e| e.to_string())?;
            }
            let tags = self.tag_string_in_tx(&tx, *file_id)?;
            tx.execute(
                "UPDATE files SET tags_text = ?1 WHERE id = ?2",
                params![tags, file_id],
            )
            .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(file_ids.len() as i64)
    }

    fn file_ids_under_folder(&self, folder_id: Option<i64>) -> Result<Vec<i64>, String> {
        match folder_id {
            None => {
                let mut stmt = self
                    .conn
                    .prepare("SELECT id FROM files WHERE missing = 0")
                    .map_err(|e| e.to_string())?;
                let ids = stmt
                    .query_map([], |r| r.get(0))
                    .map_err(|e| e.to_string())?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|e| e.to_string())?;
                Ok(ids)
            }
            Some(id) => {
                let mut stmt = self
                    .conn
                    .prepare(
                        "WITH RECURSIVE subfolders(id) AS (
                            SELECT ?1
                            UNION ALL
                            SELECT f.id FROM folders f INNER JOIN subfolders s ON f.parent_id = s.id
                         )
                         SELECT id FROM files WHERE missing = 0 AND folder_id IN (SELECT id FROM subfolders)",
                    )
                    .map_err(|e| e.to_string())?;
                let ids = stmt
                    .query_map([id], |r| r.get(0))
                    .map_err(|e| e.to_string())?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|e| e.to_string())?;
                Ok(ids)
            }
        }
    }

    fn ensure_tag_id(&self, name: &str) -> Result<i64, String> {
        self.conn
            .execute(
                "INSERT INTO tags (name) VALUES (?1) ON CONFLICT(name) DO NOTHING",
                [name],
            )
            .map_err(|e| e.to_string())?;
        self.conn
            .query_row(
                "SELECT id FROM tags WHERE name = ?1 COLLATE NOCASE",
                [name],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())
    }

    fn tag_string_in_tx(&self, tx: &rusqlite::Transaction, id: i64) -> Result<String, String> {
        let mut stmt = tx
            .prepare(
                "SELECT t.name FROM tags t JOIN file_tags ft ON ft.tag_id = t.id WHERE ft.file_id = ?1 ORDER BY t.name",
            )
            .map_err(|e| e.to_string())?;
        let names = stmt
            .query_map([id], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        Ok(names.join(" "))
    }

    pub fn list_creators(&self) -> Result<Vec<String>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT DISTINCT creator FROM files WHERE creator <> '' AND missing = 0 ORDER BY creator COLLATE NOCASE",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| r.get(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        Ok(rows)
    }

    pub fn list_tags(&self) -> Result<Vec<String>, String> {
        let mut stmt = self
            .conn
            .prepare("SELECT name FROM tags ORDER BY name COLLATE NOCASE")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| r.get(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        Ok(rows)
    }

    pub fn file_location(&self, id: i64) -> Result<FileLoc, String> {
        self.conn
            .query_row(
                "SELECT stored_relpath, folder_id, sha256, original_name FROM files WHERE id = ?1",
                [id],
                |r| {
                    Ok(FileLoc {
                        stored_relpath: r.get(0)?,
                        folder_id: r.get(1)?,
                        sha256: r.get(2)?,
                        original_name: r.get(3)?,
                    })
                },
            )
            .map_err(|_| format!("File {id} was not found."))
    }

    pub fn move_files(&self, ids: &[i64], folder_id: Option<i64>) -> Result<(), String> {
        let root = self.library_root()?;
        let dest_dir = match folder_id {
            Some(id) => root.join(self.folder_relpath(id)?),
            None => root.clone(),
        };
        std::fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
        let dest_rel_prefix = match folder_id {
            Some(id) => self.folder_relpath(id)?,
            None => String::new(),
        };
        for id in ids {
            let loc = self.file_location(*id)?;
            if loc.folder_id == folder_id {
                continue;
            }
            let src = root.join(&loc.stored_relpath);
            let file_name = Path::new(&loc.stored_relpath)
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or(loc.original_name.clone());
            let dest = crate::names::unique_file_path(&dest_dir, &file_name);
            if src.exists() {
                if std::fs::rename(&src, &dest).is_err() {
                    std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;
                    std::fs::remove_file(&src).map_err(|e| e.to_string())?;
                }
            }
            let dest_name = dest
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or(file_name);
            let stored = if dest_rel_prefix.is_empty() {
                dest_name
            } else {
                format!("{dest_rel_prefix}/{dest_name}")
            };
            self.conn
                .execute(
                    "UPDATE files SET stored_relpath = ?1, folder_id = ?2, missing = 0 WHERE id = ?3",
                    params![stored, folder_id, id],
                )
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn delete_files(&self, ids: &[i64]) -> Result<(), String> {
        let root = self.library_root()?;
        for id in ids {
            let loc = self.file_location(*id)?;
            let path = root.join(&loc.stored_relpath);
            if path.exists() {
                trash::delete(&path).map_err(|e| e.to_string())?;
            }
            let others: i64 = self
                .conn
                .query_row(
                    "SELECT COUNT(*) FROM files WHERE sha256 = ?1 AND id <> ?2",
                    params![loc.sha256, id],
                    |r| r.get(0),
                )
                .map_err(|e| e.to_string())?;
            if others == 0 {
                let thumb = thumb_path(&self.data_dir, &loc.sha256);
                let _ = std::fs::remove_file(thumb);
            }
            self.conn
                .execute("DELETE FROM files WHERE id = ?1", [id])
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn remove_missing(&self) -> Result<(), String> {
        let ids: Vec<i64> = {
            let mut stmt = self
                .conn
                .prepare("SELECT id FROM files WHERE missing = 1")
                .map_err(|e| e.to_string())?;
            let ids = stmt
                .query_map([], |r| r.get(0))
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            ids
        };
        for id in ids {
            self.conn
                .execute("DELETE FROM files WHERE id = ?1", [id])
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn set_thumb_status(&self, id: i64, status: &str) -> Result<(), String> {
        self.conn
            .execute(
                "UPDATE files SET thumb_status = ?1 WHERE id = ?2",
                params![status, id],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    fn next_pending_thumb_row(&self) -> Result<Option<ThumbCandidate>, String> {
        self.conn
            .query_row(
                "SELECT id, stored_relpath, ext, size_bytes, sha256 FROM files WHERE thumb_status = 'none' AND missing = 0 ORDER BY id LIMIT 1",
                [],
                |r| {
                    Ok(ThumbCandidate {
                        id: r.get(0)?,
                        stored_relpath: r.get(1)?,
                        ext: r.get(2)?,
                        size_bytes: r.get(3)?,
                        sha256: r.get(4)?,
                    })
                },
            )
            .optional()
            .map_err(|e| e.to_string())
    }

    pub fn claim_next_pending_thumb(&self) -> Result<Option<ThumbCandidate>, String> {
        let Some(candidate) = self.next_pending_thumb_row()? else {
            return Ok(None);
        };
        let updated = self
            .conn
            .execute(
                "UPDATE files SET thumb_status = 'rendering' WHERE id = ?1 AND thumb_status = 'none'",
                params![candidate.id],
            )
            .map_err(|e| e.to_string())?;
        if updated == 0 {
            return Ok(None);
        }
        Ok(Some(candidate))
    }

    pub fn clear_thumbs(&self) -> Result<(), String> {
        let dir = self.data_dir.join("thumbs");
        if dir.exists() {
            for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
                let entry = entry.map_err(|e| e.to_string())?;
                let _ = std::fs::remove_file(entry.path());
            }
        }
        self.conn
            .execute(
                "UPDATE files SET thumb_status = 'none' WHERE thumb_status IN ('ok', 'unavailable', 'rendering')",
                [],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn mark_missing(&self, id: i64, missing: bool) -> Result<(), String> {
        self.conn
            .execute(
                "UPDATE files SET missing = ?1 WHERE id = ?2",
                params![if missing { 1 } else { 0 }, id],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn update_path(&self, id: i64, stored_relpath: &str, folder_id: Option<i64>, size: i64, mtime: i64) -> Result<(), String> {
        self.conn
            .execute(
                "UPDATE files SET stored_relpath = ?1, folder_id = ?2, size_bytes = ?3, mtime = ?4, missing = 0 WHERE id = ?5",
                params![stored_relpath, folder_id, size, mtime, id],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn all_file_index(&self) -> Result<Vec<IndexRow>, String> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, stored_relpath, sha256 FROM files")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok(IndexRow {
                    id: r.get(0)?,
                    stored_relpath: r.get(1)?,
                    sha256: r.get(2)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        Ok(rows)
    }
}

#[derive(Clone)]
pub struct FileLoc {
    pub stored_relpath: String,
    pub folder_id: Option<i64>,
    pub sha256: String,
    pub original_name: String,
}

struct FileSeed {
    id: i64,
    original_name: String,
    sort_name: String,
    stored_relpath: String,
    ext: String,
    size_bytes: i64,
    sha256: String,
    folder_id: Option<i64>,
    creator: String,
    notes: String,
    source_archive: Option<String>,
    imported_at: i64,
    thumb_status: String,
    missing: bool,
}

pub struct ThumbCandidate {
    pub id: i64,
    pub stored_relpath: String,
    pub ext: String,
    pub size_bytes: i64,
    pub sha256: String,
}

pub struct UnhashedCandidate {
    pub id: i64,
    pub stored_relpath: String,
}

pub struct IndexRow {
    pub id: i64,
    pub stored_relpath: String,
    pub sha256: String,
}

pub enum FolderFilter {
    All,
    Root,
    Id(i64),
}

pub fn thumb_path(data_dir: &Path, sha: &str) -> PathBuf {
    data_dir.join("thumbs").join(format!("{sha}.png"))
}

pub fn fts_match(input: &str) -> Option<String> {
    let mut parts = Vec::new();
    for raw in input.split_whitespace() {
        let token: String = raw.chars().filter(|c| c.is_alphanumeric()).collect();
        if token.is_empty() {
            continue;
        }
        parts.push(format!("{token}*"));
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join(" "))
    }
}

fn chrono_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fts_prefix_and_underscore_tokens() {
        let dir = std::env::temp_dir().join(format!("filelib-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let db = open(&dir).unwrap();
        let root = dir.join("library");
        std::fs::create_dir_all(&root).unwrap();
        let mut settings = Settings::default();
        settings.library_root = Some(root.to_string_lossy().to_string());
        db.save_settings(&settings).unwrap();
        let id = db
            .insert_file(
                "Throne_of_Baal.stl",
                "Throne_of_Baal.stl",
                "stl",
                10,
                "abc",
                1,
                None,
                None,
            )
            .unwrap();
        let found = db
            .list_files(FolderFilter::All, "thro", "", "", "name")
            .unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].id, id);
        assert_eq!(found[0].sort_name, "Throne of Baal");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn add_tags_under_folder_keeps_existing_and_skips_siblings() {
        let dir = std::env::temp_dir().join(format!("filelib-masstag-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let db = open(&dir).unwrap();
        let root = dir.join("library");
        std::fs::create_dir_all(&root).unwrap();
        let mut settings = Settings::default();
        settings.library_root = Some(root.to_string_lossy().to_string());
        db.save_settings(&settings).unwrap();

        let parent = db.create_folder(None, "Parent", 0).unwrap();
        let child = db.create_folder(Some(parent.id), "Child", 0).unwrap();
        let sibling = db.create_folder(None, "Sibling", 0).unwrap();

        let in_parent = db
            .insert_file("a.stl", "a.stl", "stl", 1, "sha1", 1, Some(parent.id), None)
            .unwrap();
        let in_child = db
            .insert_file("b.stl", "b.stl", "stl", 1, "sha2", 1, Some(child.id), None)
            .unwrap();
        let in_sibling = db
            .insert_file("c.stl", "c.stl", "stl", 1, "sha3", 1, Some(sibling.id), None)
            .unwrap();

        db.set_tags(in_parent, &["existing".into()]).unwrap();
        let count = db
            .add_tags_under_folder(Some(parent.id), &["newtag".into()])
            .unwrap();
        assert_eq!(count, 2);

        let parent_row = db
            .list_files(FolderFilter::Id(parent.id), "", "", "", "name")
            .unwrap();
        assert_eq!(parent_row[0].tags, vec!["existing", "newtag"]);

        let child_row = db
            .list_files(FolderFilter::Id(child.id), "", "", "", "name")
            .unwrap();
        assert_eq!(child_row[0].tags, vec!["newtag"]);

        let sibling_row = db
            .list_files(FolderFilter::Id(sibling.id), "", "", "", "name")
            .unwrap();
        assert_eq!(sibling_row[0].tags, Vec::<String>::new());
        assert_eq!(in_sibling, sibling_row[0].id);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn move_folder_updates_disk_and_paths() {
        let dir = std::env::temp_dir().join(format!("filelib-movefolder-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let db = open(&dir).unwrap();
        let root = dir.join("library");
        std::fs::create_dir_all(&root).unwrap();
        let mut settings = Settings::default();
        settings.library_root = Some(root.to_string_lossy().to_string());
        db.save_settings(&settings).unwrap();

        let dest = db.create_folder(None, "Dest", 0).unwrap();
        let source = db.create_folder(None, "Source", 0).unwrap();
        let nested = db.create_folder(Some(source.id), "Nested", 0).unwrap();
        let stored = "Source/Nested/part.stl";
        std::fs::write(root.join(stored), b"x").unwrap();
        let file_id = db
            .insert_file("part.stl", stored, "stl", 1, "sha-move", 1, Some(nested.id), None)
            .unwrap();

        db.move_folder(source.id, Some(dest.id)).unwrap();

        assert!(root.join("Dest/Source").is_dir());
        assert!(root.join("Dest/Source/Nested").is_dir());
        assert!(root.join("Dest/Source/Nested/part.stl").is_file());
        assert!(!root.join(&source.relpath).exists());

        let folders = db.list_folders().unwrap();
        let moved = folders.iter().find(|f| f.id == source.id).unwrap();
        assert_eq!(moved.parent_id, Some(dest.id));
        assert_eq!(moved.relpath, "Dest/Source");

        let nested_row = folders.iter().find(|f| f.id == nested.id).unwrap();
        assert_eq!(nested_row.relpath, "Dest/Source/Nested");

        let files = db
            .list_files(FolderFilter::Id(nested.id), "", "", "", "name")
            .unwrap();
        assert_eq!(files[0].id, file_id);
        assert_eq!(files[0].stored_relpath, "Dest/Source/Nested/part.stl");

        assert!(db.move_folder(dest.id, Some(source.id)).is_err());
        assert!(db.move_folder(source.id, Some(source.id)).is_err());

        let _ = std::fs::remove_dir_all(&dir);
    }
}
