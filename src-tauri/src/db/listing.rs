impl AppDb {
    #[cfg(test)]
    pub fn list_files(
        &self,
        folder: FolderFilter,
        query: &str,
        creator: &str,
        tag: &str,
        sort: &str,
    ) -> Result<Vec<FileRow>, String> {
        self.query_files(FileQuery {
            folder,
            query,
            creator,
            tag,
            tag_ids: &[],
            tag_match: TagMatch::Any,
            exts: &[],
            sort,
            limit: None,
            offset: 0,
        })
    }

    pub fn query_files(&self, list: FileQuery<'_>) -> Result<Vec<FileRow>, String> {
        let root = self.library_root().unwrap_or_default();
        let fts = fts_match(list.query);
        let mut sql = String::from(
            "SELECT f.id, f.original_name, f.sort_name, f.stored_relpath, f.ext, f.size_bytes, f.sha256, f.folder_id, f.creator, f.notes, f.source_archive, f.imported_at, f.thumb_status, f.missing
             FROM files f",
        );
        if fts.is_some() {
            sql.push_str(" JOIN files_fts ON files_fts.rowid = f.id");
        }
        sql.push_str(" WHERE f.missing = 0");
        let mut param_values: Vec<String> = Vec::new();
        push_folder_scope(&mut sql, &mut param_values, list.folder);
        if !list.creator.is_empty() {
            sql.push_str(" AND f.creator = ? COLLATE NOCASE");
            param_values.push(list.creator.to_string());
        }
        if !list.tag.is_empty() {
            sql.push_str(
                " AND EXISTS (SELECT 1 FROM file_tags ft JOIN tags t ON t.id = ft.tag_id WHERE ft.file_id = f.id AND t.name = ? COLLATE NOCASE)",
            );
            param_values.push(list.tag.to_string());
        }
        push_tag_ids(&mut sql, &mut param_values, list.tag_ids, list.tag_match);
        push_ext_in(&mut sql, &mut param_values, list.exts);
        if let Some(match_q) = &fts {
            sql.push_str(" AND files_fts MATCH ?");
            param_values.push(match_q.clone());
        }
        sql.push_str(match list.sort {
            "creator" => " ORDER BY f.creator COLLATE NOCASE, f.sort_name COLLATE NOCASE",
            "date" => " ORDER BY f.imported_at DESC, f.sort_name COLLATE NOCASE",
            _ => " ORDER BY f.sort_name COLLATE NOCASE",
        });
        if let Some(limit) = list.limit {
            sql.push_str(" LIMIT ? OFFSET ?");
            param_values.push(limit.to_string());
            param_values.push(list.offset.to_string());
        }
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

    pub fn type_counts(
        &self,
        folder: FolderFilter,
        query: &str,
        creator: &str,
        tag_ids: &[i64],
        tag_match: TagMatch,
    ) -> Result<Vec<TypeCount>, String> {
        let fts = fts_match(query);
        let mut sql = String::from("SELECT lower(f.ext), COUNT(*) FROM files f");
        if fts.is_some() {
            sql.push_str(" JOIN files_fts ON files_fts.rowid = f.id");
        }
        sql.push_str(" WHERE f.missing = 0");
        let mut param_values: Vec<String> = Vec::new();
        push_folder_scope(&mut sql, &mut param_values, folder);
        if !creator.is_empty() {
            sql.push_str(" AND f.creator = ? COLLATE NOCASE");
            param_values.push(creator.to_string());
        }
        push_tag_ids(&mut sql, &mut param_values, tag_ids, tag_match);
        if let Some(match_q) = &fts {
            sql.push_str(" AND files_fts MATCH ?");
            param_values.push(match_q.clone());
        }
        sql.push_str(" GROUP BY lower(f.ext)");
        let mut stmt = self.conn.prepare(&sql).map_err(|e| e.to_string())?;
        let params_ref: Vec<&dyn rusqlite::ToSql> = param_values
            .iter()
            .map(|s| s as &dyn rusqlite::ToSql)
            .collect();
        let rows = stmt
            .query_map(params_ref.as_slice(), |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        drop(stmt);
        let mut totals = std::collections::HashMap::<String, i64>::new();
        for (ext, count) in rows {
            totals.insert(ext, count);
        }
        Ok(crate::names::supported_types()
            .iter()
            .map(|group| TypeCount {
                file_count: group.exts.iter().map(|ext| totals.get(ext).copied().unwrap_or(0)).sum(),
                id: group.id.clone(),
                label: group.label.clone(),
                exts: group.exts.clone(),
            })
            .collect())
    }

    pub fn library_stats(&self) -> Result<LibraryStats, String> {
        self.conn
            .query_row(
                "SELECT
                    (SELECT COUNT(*) FROM files),
                    (SELECT COUNT(*) FROM folders),
                    (SELECT COALESCE(SUM(size_bytes), 0) FROM files)",
                [],
                |row| {
                    Ok(LibraryStats {
                        file_count: row.get(0)?,
                        folder_count: row.get(1)?,
                        size_bytes: row.get(2)?,
                    })
                },
            )
            .map_err(|err| err.to_string())
    }

}

fn push_folder_scope(sql: &mut String, params: &mut Vec<String>, folder: FolderFilter) {
    match folder {
        FolderFilter::All => {}
        FolderFilter::Root => sql.push_str(" AND f.folder_id IS NULL"),
        FolderFilter::Id(id) => {
            sql.push_str(" AND f.folder_id = ?");
            params.push(id.to_string());
        }
    }
}

fn unique_tag_ids(ids: &[i64]) -> Vec<i64> {
    let mut out = Vec::new();
    for id in ids {
        if !out.contains(id) {
            out.push(*id);
        }
    }
    out
}

fn push_tag_ids(sql: &mut String, params: &mut Vec<String>, ids: &[i64], mode: TagMatch) {
    let ids = unique_tag_ids(ids);
    if ids.is_empty() {
        return;
    }
    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    match mode {
        TagMatch::Any => {
            sql.push_str(&format!(
                " AND f.id IN (SELECT file_id FROM file_tags WHERE tag_id IN ({placeholders}))"
            ));
        }
        TagMatch::All => {
            sql.push_str(&format!(
                " AND f.id IN (SELECT file_id FROM file_tags WHERE tag_id IN ({placeholders}) GROUP BY file_id HAVING COUNT(DISTINCT tag_id) = CAST(? AS INTEGER))"
            ));
        }
    }
    for id in &ids {
        params.push(id.to_string());
    }
    if mode == TagMatch::All {
        params.push(ids.len().to_string());
    }
}
