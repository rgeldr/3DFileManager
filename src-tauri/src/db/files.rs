impl AppDb {
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
        let thumb_status = if crate::names::queues_thumbnail(ext) {
            "none"
        } else {
            "unavailable"
        };
        self.insert_file_with_thumb_status(
            original_name,
            stored_relpath,
            ext,
            size_bytes,
            sha256,
            mtime,
            folder_id,
            source_archive,
            thumb_status,
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
        let ext: String = self
            .conn
            .query_row("SELECT ext FROM files WHERE id = ?1", [id], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        let thumb_status = if crate::names::queues_thumbnail(&ext) {
            "none"
        } else {
            "unavailable"
        };
        self.conn
            .execute(
                "UPDATE files SET sha256 = ?1, thumb_status = ?2 WHERE id = ?3",
                params![sha256, thumb_status, id],
            )
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


    pub fn file_row_exists(&self, id: i64) -> Result<bool, String> {
        let count: i64 = self
            .conn
            .query_row("SELECT COUNT(*) FROM files WHERE id = ?1", [id], |row| row.get(0))
            .map_err(|err| err.to_string())?;
        Ok(count > 0)
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

    #[cfg(test)]
    pub fn move_files(&self, ids: &[i64], folder_id: Option<i64>) -> Result<(), String> {
        self.move_files_with(ids, folder_id, &AtomicBool::new(false), |_| {})
            .map(|_| ())
    }

    pub fn move_files_with<F: FnMut(DiskProgress)>(
        &self,
        ids: &[i64],
        folder_id: Option<i64>,
        cancel: &AtomicBool,
        mut progress: F,
    ) -> Result<bool, String> {
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
        let mut planned = Vec::new();
        let mut bytes_total = 0u64;
        for id in ids {
            let loc = self.file_location(*id)?;
            if loc.folder_id == folder_id {
                continue;
            }
            let src = root.join(&loc.stored_relpath);
            let len = src.metadata().map(|meta| meta.len()).unwrap_or(0);
            bytes_total += len;
            planned.push((*id, loc, len));
        }
        let total = planned.len() as u32;
        let mut bytes_done = 0u64;
        for (index, (id, loc, _len)) in planned.into_iter().enumerate() {
            if cancel.load(std::sync::atomic::Ordering::SeqCst) {
                return Ok(true);
            }
            let file_name = Path::new(&loc.stored_relpath)
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or(loc.original_name.clone());
            let current = index as u32;
            progress(DiskProgress {
                current,
                total,
                name: file_name.clone(),
                bytes_done,
                bytes_total,
                cancellable: true,
            });
            let src = root.join(&loc.stored_relpath);
            let dest = crate::names::unique_file_path(&dest_dir, &file_name);
            if relocate::move_file(
                &src,
                &dest,
                cancel,
                &mut bytes_done,
                bytes_total,
                current,
                total,
                &mut progress,
            )? {
                return Ok(true);
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
            if let Err(err) = self.conn.execute(
                "UPDATE files SET stored_relpath = ?1, folder_id = ?2, missing = 0 WHERE id = ?3",
                params![stored, folder_id, id],
            ) {
                if !src.exists() && dest.exists() {
                    let _ = std::fs::rename(&dest, &src);
                }
                return Err(err.to_string());
            }
            progress(DiskProgress {
                current: current + 1,
                total,
                name: Path::new(&stored)
                    .file_name()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_default(),
                bytes_done,
                bytes_total,
                cancellable: true,
            });
        }
        Ok(false)
    }

    pub fn trash_items(&self, ids: &[i64]) -> Result<Vec<TrashItem>, String> {
        let root = self.library_root()?;
        let mut items = Vec::with_capacity(ids.len());
        for id in ids {
            let loc = self.file_location(*id)?;
            let joined = root.join(&loc.stored_relpath);
            let path = if joined.exists() {
                crate::contained_library_file(&root, &loc.stored_relpath)?
            } else if joined.starts_with(&root) {
                joined
            } else {
                return Err("That file is outside the library.".into());
            };
            let name = Path::new(&loc.stored_relpath)
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or(loc.original_name);
            let bytes = path.metadata().map(|meta| meta.len()).unwrap_or(0);
            items.push(TrashItem {
                id: *id,
                path,
                sha256: loc.sha256,
                name,
                bytes,
            });
        }
        Ok(items)
    }

    /// Drop the catalog row and an unshared thumbnail. The caller deletes the library file.
    pub fn remove_catalogued_file(&self, id: i64, sha256: &str) -> Result<(), String> {
        let others: i64 = self
            .conn
            .query_row(
                "SELECT COUNT(*) FROM files WHERE sha256 = ?1 AND id <> ?2",
                params![sha256, id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if others == 0 && !sha256.is_empty() {
            let _ = std::fs::remove_file(thumb_path(&self.data_dir, sha256));
        }
        self.conn
            .execute("DELETE FROM files WHERE id = ?1", [id])
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

    pub fn rename_library_file(&self, id: i64, typed: &str) -> Result<(), String> {
        let loc = self.file_location(id)?;
        let root = self.library_root()?;
        let joined = root.join(&loc.stored_relpath);
        let source = match crate::contained_library_file(&root, &loc.stored_relpath) {
            Ok(path) => path,
            Err(err) => {
                if !joined.exists() {
                    return Err("That file is missing on disk, so it can't be renamed.".into());
                }
                return Err(err);
            }
        };
        let current_ext = crate::names::extension_of(&loc.stored_relpath);
        let parts = crate::names::rename_parts(&current_ext, typed)?;
        let parent_rel = match loc.stored_relpath.rsplit_once('/') {
            Some((parent, _)) => parent.to_string(),
            None => String::new(),
        };
        let new_rel = if parent_rel.is_empty() {
            parts.file_name.clone()
        } else {
            format!("{parent_rel}/{}", parts.file_name)
        };
        if new_rel.split('/').any(|part| part.is_empty() || part == "." || part == "..") {
            return Err("That file is outside the library.".into());
        }
        let Some(parent) = source.parent() else {
            return Err("That file is outside the library.".into());
        };
        let parent = parent
            .canonicalize()
            .map_err(|_| "That file is outside the library.".to_string())?;
        let root = root
            .canonicalize()
            .map_err(|_| "That file is outside the library.".to_string())?;
        if !parent.starts_with(&root) {
            return Err("That file is outside the library.".into());
        }
        let dest = parent.join(&parts.file_name);
        if directory_has_other_name(&parent, &parts.file_name, &source)? {
            return Err(format!(
                "A file named \"{}\" is already in this folder.",
                parts.file_name
            ));
        }
        let taken: i64 = self
            .conn
            .query_row(
                "SELECT COUNT(*) FROM files WHERE id <> ?1 AND stored_relpath = ?2 COLLATE NOCASE",
                params![id, new_rel],
                |row| row.get(0),
            )
            .map_err(|err| err.to_string())?;
        if taken > 0 {
            return Err(format!(
                "A file named \"{}\" is already in this folder.",
                parts.file_name
            ));
        }
        let current_name = source
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_default();
        let write_row = |mtime: i64| {
            self.conn
                .execute(
                    "UPDATE files SET original_name = ?1, sort_name = ?2, stored_relpath = ?3, ext = ?4, mtime = ?5, missing = 0 WHERE id = ?6",
                    params![parts.file_name, parts.sort_name, new_rel, parts.ext, mtime, id],
                )
                .map_err(|err| err.to_string())?;
            Ok(())
        };
        if current_name == parts.file_name {
            let mtime = file_mtime(&source);
            return write_row(mtime);
        }
        rename_then(&source, &dest, || {
            if crate::contained_library_file(&root, &new_rel).is_err() {
                return Err("That file is outside the library.".into());
            }
            write_row(file_mtime(&dest))
        })
    }

    pub fn all_file_index(&self) -> Result<Vec<IndexRow>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, stored_relpath, sha256, size_bytes, mtime, folder_id, missing FROM files",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok(IndexRow {
                    id: r.get(0)?,
                    stored_relpath: r.get(1)?,
                    sha256: r.get(2)?,
                    size_bytes: r.get(3)?,
                    mtime: r.get(4)?,
                    folder_id: r.get(5)?,
                    missing: r.get::<_, i64>(6)? != 0,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        Ok(rows)
    }
}

fn file_mtime(path: &std::path::Path) -> i64 {
    std::fs::metadata(path)
        .ok()
        .and_then(|meta| meta.modified().ok())
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0)
}

fn directory_has_other_name(dir: &std::path::Path, file_name: &str, source: &std::path::Path) -> Result<bool, String> {
    let entries = std::fs::read_dir(dir).map_err(|err| err.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|err| err.to_string())?;
        if !entry.file_name().to_string_lossy().eq_ignore_ascii_case(file_name) {
            continue;
        }
        let path = entry.path();
        if path == source {
            continue;
        }
        if let (Ok(found), Ok(current)) = (path.canonicalize(), source.canonicalize()) {
            if found == current {
                continue;
            }
        }
        return Ok(true);
    }
    Ok(false)
}

pub(crate) fn rename_then(
    source: &std::path::Path,
    dest: &std::path::Path,
    write: impl FnOnce() -> Result<(), String>,
) -> Result<(), String> {
    std::fs::rename(source, dest).map_err(|err| err.to_string())?;
    if let Err(err) = write() {
        if let Err(undo) = std::fs::rename(dest, source) {
            return Err(format!("{err} The rename could not be undone: {undo}"));
        }
        return Err(err);
    }
    Ok(())
}
