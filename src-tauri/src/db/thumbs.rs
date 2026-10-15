impl AppDb {
    pub fn release_rendering_thumb(&self, id: i64) -> Result<(), String> {
        self.conn
            .execute(
                "UPDATE files SET thumb_status = 'none' WHERE id = ?1 AND thumb_status = 'rendering'",
                [id],
            )
            .map_err(|e| e.to_string())?;
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

    pub fn mark_thumb_ok(&self, id: i64) -> Result<(), String> {
        self.conn
            .execute(
                "UPDATE files SET thumb_status = 'ok', thumb_attempts = 0 WHERE id = ?1",
                [id],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn note_thumb_io_failure(&self, id: i64) -> Result<(), String> {
        let attempts: i64 = self
            .conn
            .query_row("SELECT thumb_attempts FROM files WHERE id = ?1", [id], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        let next = attempts + 1;
        let status = if next >= 3 { "unavailable" } else { "none" };
        self.conn
            .execute(
                "UPDATE files SET thumb_status = ?1, thumb_attempts = ?2 WHERE id = ?3",
                params![status, next, id],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn requeue_unavailable_images(&self) -> Result<usize, String> {
        let changed = self
            .conn
            .execute(
                "UPDATE files SET thumb_status = 'none', thumb_attempts = 0 WHERE thumb_status = 'unavailable' AND ext IN ('png', 'jpg', 'jpeg')",
                [],
            )
            .map_err(|e| e.to_string())?;
        Ok(changed)
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
                "SELECT id, stored_relpath, ext, size_bytes, sha256 FROM files WHERE thumb_status = 'none' AND missing = 0 ORDER BY CASE WHEN ext IN ('png','jpg','jpeg') THEN 0 WHEN ext IN ('stl','obj','3mf') THEN 2 ELSE 1 END, id LIMIT 1",
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

    pub fn pending_thumb_count(&self) -> Result<i64, String> {
        self.conn
            .query_row(
                "SELECT count(*) FROM files WHERE thumb_status IN ('none', 'rendering') AND missing = 0",
                [],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())
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
                "UPDATE files SET thumb_status = 'none', thumb_attempts = 0 WHERE thumb_status IN ('ok', 'unavailable', 'rendering')",
                [],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

}
