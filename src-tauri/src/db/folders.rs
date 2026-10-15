impl AppDb {
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

    pub fn rename_folder_with<F: FnMut(DiskProgress)>(
        &self,
        id: i64,
        new_name: &str,
        cancel: &AtomicBool,
        progress: F,
    ) -> Result<bool, String> {
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
        self.relocate_folder(
            id,
            parent_id,
            &unique,
            &root,
            &old_rel,
            &new_rel,
            cancel,
            false,
            progress,
        )
    }

    #[cfg(test)]
    pub fn move_folder(&self, id: i64, new_parent_id: Option<i64>) -> Result<(), String> {
        self.move_folder_with(id, new_parent_id, &AtomicBool::new(false), false, |_| {})
            .map(|_| ())
    }

    pub fn move_folder_with<F: FnMut(DiskProgress)>(
        &self,
        id: i64,
        new_parent_id: Option<i64>,
        cancel: &AtomicBool,
        force_copy: bool,
        progress: F,
    ) -> Result<bool, String> {
        let current_parent: Option<i64> = self
            .conn
            .query_row("SELECT parent_id FROM folders WHERE id = ?1", [id], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if current_parent == new_parent_id {
            return Ok(false);
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
        self.relocate_folder(
            id,
            new_parent_id,
            &unique,
            &root,
            &old_rel,
            &new_rel,
            cancel,
            force_copy,
            progress,
        )
    }

    fn relocate_folder<F: FnMut(DiskProgress)>(
        &self,
        id: i64,
        parent_id: Option<i64>,
        name: &str,
        root: &Path,
        old_rel: &str,
        new_rel: &str,
        cancel: &AtomicBool,
        force_copy: bool,
        mut progress: F,
    ) -> Result<bool, String> {
        let from = root.join(old_rel);
        let to = root.join(new_rel);
        let kind = relocate::move_tree(&from, &to, cancel, force_copy, &mut progress)?;
        if kind == TreeMove::Cancelled {
            return Ok(true);
        }
        if kind == TreeMove::Copied && cancel.load(std::sync::atomic::Ordering::SeqCst) {
            let _ = std::fs::remove_dir_all(&to);
            return Ok(true);
        }
        let rewrite = self.rewrite_moved_tree(old_rel, new_rel, id, parent_id, name, &mut progress);
        if let Err(err) = rewrite {
            match kind {
                TreeMove::Renamed if from != to => {
                    let _ = std::fs::rename(&to, &from);
                }
                TreeMove::Copied => {
                    let _ = std::fs::remove_dir_all(&to);
                }
                _ => {}
            }
            return Err(err);
        }
        if kind == TreeMove::Copied {
            std::fs::remove_dir_all(&from).map_err(|e| {
                format!(
                    "The folder was copied, but the original could not be removed: {e}"
                )
            })?;
        }
        Ok(false)
    }

    fn rewrite_moved_tree<F: FnMut(DiskProgress)>(
        &self,
        old_rel: &str,
        new_rel: &str,
        folder_id: i64,
        parent_id: Option<i64>,
        folder_name: &str,
        progress: &mut F,
    ) -> Result<(), String> {
        progress(DiskProgress {
            current: 0,
            total: 0,
            name: "Updating catalog".into(),
            bytes_done: 0,
            bytes_total: 0,
            cancellable: false,
        });
        let old_prefix = format!("{old_rel}/");
        let folders: Vec<FolderRow> = self
            .list_folders()?
            .into_iter()
            .filter(|folder| folder.relpath == old_rel || folder.relpath.starts_with(&old_prefix))
            .collect();
        let mut stmt = self
            .conn
            .prepare("SELECT id, stored_relpath FROM files")
            .map_err(|e| e.to_string())?;
        let files: Vec<(i64, String)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        drop(stmt);
        let files: Vec<(i64, String)> = files
            .into_iter()
            .filter(|(_, rel)| rel == old_rel || rel.starts_with(&old_prefix))
            .collect();
        let total = (folders.len() + files.len()) as u32;
        self.conn.execute_batch("BEGIN").map_err(|e| e.to_string())?;
        let applied = (|| -> Result<(), String> {
            let mut current = 0u32;
            for folder in folders {
                let updated = if folder.relpath == old_rel {
                    new_rel.to_string()
                } else {
                    format!("{new_rel}{}", &folder.relpath[old_rel.len()..])
                };
                let name = if folder.id == folder_id {
                    folder_name.to_string()
                } else {
                    folder.name
                };
                if folder.id == folder_id {
                    self.conn
                        .execute(
                            "UPDATE folders SET parent_id = ?1, relpath = ?2, name = ?3 WHERE id = ?4",
                            params![parent_id, updated, name, folder.id],
                        )
                        .map_err(|e| e.to_string())?;
                } else {
                    self.conn
                        .execute(
                            "UPDATE folders SET relpath = ?1, name = ?2 WHERE id = ?3",
                            params![updated, name, folder.id],
                        )
                        .map_err(|e| e.to_string())?;
                }
                current += 1;
                if current == total || current % 25 == 0 {
                    progress(DiskProgress {
                        current,
                        total,
                        name: "Updating catalog".into(),
                        bytes_done: 0,
                        bytes_total: 0,
                        cancellable: false,
                    });
                }
            }
            for (file_id, rel) in files {
                let updated = format!("{new_rel}{}", &rel[old_rel.len()..]);
                self.conn
                    .execute(
                        "UPDATE files SET stored_relpath = ?1 WHERE id = ?2",
                        params![updated, file_id],
                    )
                    .map_err(|e| e.to_string())?;
                current += 1;
                if current == total || current % 25 == 0 {
                    progress(DiskProgress {
                        current,
                        total,
                        name: "Updating catalog".into(),
                        bytes_done: 0,
                        bytes_total: 0,
                        cancellable: false,
                    });
                }
            }
            Ok(())
        })();
        match applied {
            Ok(()) => self.conn.execute_batch("COMMIT").map_err(|e| e.to_string()),
            Err(err) => {
                let _ = self.conn.execute_batch("ROLLBACK");
                Err(err)
            }
        }
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

}
