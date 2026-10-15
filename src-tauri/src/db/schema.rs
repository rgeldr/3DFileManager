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

fn migrate(conn: &Connection) -> Result<(), String> {
    let version: i32 = conn
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let mut version = version;
    if version < 1 {
        conn.execute_batch(SCHEMA).map_err(|e| e.to_string())?;
        conn.pragma_update(None, "user_version", 1)
            .map_err(|e| e.to_string())?;
        version = 1;
    }
    if version < 2 {
        conn.execute(
            "ALTER TABLE files ADD COLUMN thumb_attempts INTEGER NOT NULL DEFAULT 0",
            [],
        )
        .map_err(|e| e.to_string())?;
        conn.pragma_update(None, "user_version", 2)
            .map_err(|e| e.to_string())?;
    }
    conn.execute(
        "UPDATE files SET thumb_status = 'none' WHERE thumb_status = 'rendering'",
        [],
    )
    .map_err(|e| e.to_string())?;
    let placeholders = crate::names::THUMBNAIL_EXTS
        .iter()
        .map(|_| "?")
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!(
        "UPDATE files SET thumb_status = 'unavailable' WHERE thumb_status IN ('none', 'rendering') AND ext NOT IN ({})",
        placeholders
    );
    conn.execute(&sql, params_from_iter(crate::names::THUMBNAIL_EXTS.iter().copied()))
        .map_err(|e| e.to_string())?;
    Ok(())
}
