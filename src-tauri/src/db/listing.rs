impl AppDb {
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

    fn hydrate_with_tags(
        &self,
        seed: FileSeed,
        root: &Path,
        tags: Vec<String>,
    ) -> Result<FileRow, String> {
        let absolute = root.join(&seed.stored_relpath);
        // Trust thumb_status. A per-file exists() check holds the database lock
        // across a syscall for every row while the window is waiting on a list.
        let thumb_path = if seed.thumb_status == "ok" && !seed.sha256.is_empty() {
            Some(thumb_path(&self.data_dir, &seed.sha256).to_string_lossy().to_string())
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

    #[cfg(test)]
    pub fn update_file(
        &self,
        id: i64,
        sort_name: &str,
        creator: &str,
        notes: &str,
        folder_id: Option<i64>,
    ) -> Result<(), String> {
        self.update_file_with(id, sort_name, creator, notes, folder_id, &AtomicBool::new(false), |_| {})
            .map(|_| ())
    }

    pub fn update_file_with<F: FnMut(DiskProgress)>(
        &self,
        id: i64,
        sort_name: &str,
        creator: &str,
        notes: &str,
        folder_id: Option<i64>,
        cancel: &AtomicBool,
        progress: F,
    ) -> Result<bool, String> {
        let current = self.file_location(id)?;
        if current.folder_id != folder_id && self.move_files_with(&[id], folder_id, cancel, progress)? {
            return Ok(true);
        }
        self.conn
            .execute(
                "UPDATE files SET sort_name = ?1, creator = ?2, notes = ?3 WHERE id = ?4",
                params![sort_name.trim(), creator.trim(), notes, id],
            )
            .map_err(|e| e.to_string())?;
        Ok(false)
    }

}
