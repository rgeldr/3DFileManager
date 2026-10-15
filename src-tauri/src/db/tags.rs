impl AppDb {
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


    pub fn file_ids_for_creator_scope(
        &self,
        folder_id: Option<i64>,
        include_subfolders: bool,
    ) -> Result<Vec<i64>, String> {
        if include_subfolders {
            return self.file_ids_under_folder(folder_id);
        }
        match folder_id {
            None => {
                let mut stmt = self
                    .conn
                    .prepare("SELECT id FROM files WHERE missing = 0 AND folder_id IS NULL")
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
                    .prepare("SELECT id FROM files WHERE missing = 0 AND folder_id = ?1")
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

    pub fn set_creator_under_folder(
        &self,
        folder_id: Option<i64>,
        creator: &str,
        include_subfolders: bool,
    ) -> Result<i64, String> {
        let creator = creator.trim();
        if creator.is_empty() {
            return Err("Creator is required.".into());
        }
        let ids = self.file_ids_for_creator_scope(folder_id, include_subfolders)?;
        let tx = self.conn.unchecked_transaction().map_err(|e| e.to_string())?;
        for chunk in ids.chunks(500) {
            if chunk.is_empty() {
                continue;
            }
            let mut sql = String::from("UPDATE files SET creator = ?1 WHERE missing = 0 AND id IN (");
            for (index, _) in chunk.iter().enumerate() {
                if index > 0 {
                    sql.push(',');
                }
                sql.push('?');
                sql.push_str(&(index + 2).to_string());
            }
            sql.push(')');
            let mut values = Vec::with_capacity(chunk.len() + 1);
            values.push(rusqlite::types::Value::Text(creator.to_string()));
            for id in chunk {
                values.push(rusqlite::types::Value::Integer(*id));
            }
            tx.execute(&sql, params_from_iter(values.iter()))
                .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(ids.len() as i64)
    }

    pub fn apply_import_meta(
        &self,
        ids: &[i64],
        creator: Option<&str>,
        tags: Option<&[String]>,
    ) -> Result<(), String> {
        let creator = creator.map(str::trim).filter(|value| !value.is_empty());
        let tag_list: Vec<String> = tags
            .unwrap_or(&[])
            .iter()
            .map(|tag| tag.trim().to_string())
            .filter(|tag| !tag.is_empty())
            .collect();
        let apply_tags = tags.is_some() && !tag_list.is_empty();
        if creator.is_none() && !apply_tags {
            return Ok(());
        }
        let tx = self.conn.unchecked_transaction().map_err(|e| e.to_string())?;
        for id in ids {
            let present: bool = tx
                .query_row(
                    "SELECT 1 FROM files WHERE id = ?1 AND missing = 0",
                    [id],
                    |_| Ok(true),
                )
                .optional()
                .map_err(|e| e.to_string())?
                .unwrap_or(false);
            if !present {
                continue;
            }
            if let Some(creator) = creator {
                tx.execute(
                    "UPDATE files SET creator = ?1 WHERE id = ?2",
                    params![creator, id],
                )
                .map_err(|e| e.to_string())?;
            }
            if apply_tags {
                self.set_tags(*id, &tag_list)?;
            }
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }

}
