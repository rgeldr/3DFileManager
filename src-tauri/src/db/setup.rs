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

    /// Moves the library folder to `dest` and points settings at the new path.
    /// Same-volume uses rename; cross-volume / network uses copy-then-delete.
    pub fn move_library_root<F: FnMut(DiskProgress)>(
        &self,
        dest: &Path,
        cancel: &AtomicBool,
        progress: F,
    ) -> Result<bool, String> {
        self.move_library_root_with(dest, cancel, false, progress)
    }

    pub fn move_library_root_with<F: FnMut(DiskProgress)>(
        &self,
        dest: &Path,
        cancel: &AtomicBool,
        force_copy: bool,
        mut progress: F,
    ) -> Result<bool, String> {
        let from = self.library_root()?;
        if !from.is_dir() {
            return Err(format!(
                "The current library folder was not found: {}",
                from.display()
            ));
        }
        if !dest.is_dir() {
            return Err("Pick an existing folder for the new library location.".into());
        }
        let to = dest.canonicalize().map_err(|e| {
            format!(
                "Could not open the destination folder (check that the drive or network path is available): {e}"
            )
        })?;
        let from = from.canonicalize().map_err(|e| e.to_string())?;
        if from == to {
            return Err("The library is already at that location.".into());
        }
        if to.starts_with(&from) {
            return Err("Choose a folder outside the current library.".into());
        }
        if from.starts_with(&to) {
            return Err("The destination cannot contain the current library folder.".into());
        }
        if !dir_is_empty(&to)? {
            return Err(
                "The destination folder must be empty. Choose or create an empty folder."
                    .into(),
            );
        }
        // rename needs the destination path to not exist; drop the empty shell first.
        std::fs::remove_dir(&to).map_err(|e| {
            format!("Could not prepare the destination folder: {e}")
        })?;
        let kind = match relocate::move_tree(&from, &to, cancel, force_copy, &mut progress) {
            Ok(kind) => kind,
            Err(err) => {
                // We removed the empty destination shell so rename could succeed; put it back.
                let _ = std::fs::create_dir_all(&to);
                return Err(err);
            }
        };
        if kind == TreeMove::Cancelled {
            // Recreate the empty destination the user picked so the path still exists.
            let _ = std::fs::create_dir_all(&to);
            return Ok(true);
        }
        let new_root = to.to_string_lossy().to_string();
        let mut settings = self.settings();
        let previous = settings.library_root.clone();
        settings.library_root = Some(new_root);
        if let Err(err) = self.save_settings(&settings) {
            match kind {
                TreeMove::Renamed => {
                    let _ = std::fs::rename(&to, &from);
                }
                TreeMove::Copied => {
                    let _ = std::fs::remove_dir_all(&to);
                }
                TreeMove::Cancelled => {}
            }
            return Err(format!("The library was moved, but settings could not be updated: {err}"));
        }
        if kind == TreeMove::Copied {
            if let Err(err) = std::fs::remove_dir_all(&from) {
                return Err(format!(
                    "The library was copied to the new location and the app will use it, but the old folder could not be removed ({}). You can delete it manually. Previous path: {}",
                    err,
                    previous.unwrap_or_default()
                ));
            }
        }
        Ok(false)
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


    pub fn set_pane_widths(&self, sidebar_width: u32, inspector_width: u32) -> Result<(), String> {
        settings::check_pane_widths(sidebar_width, inspector_width)?;
        let mut settings = self.settings();
        settings.sidebar_width = sidebar_width;
        settings.inspector_width = inspector_width;
        self.save_settings(&settings)
    }

    pub fn set_details_columns(&self, columns: settings::DetailsColumns) -> Result<(), String> {
        settings::check_details_columns(&columns)?;
        let mut settings = self.settings();
        settings.details_columns = columns;
        self.save_settings(&settings)
    }

    pub fn set_preview_height(&self, preview_height: u32) -> Result<(), String> {
        settings::check_preview_height(preview_height)?;
        let mut settings = self.settings();
        settings.preview_height = preview_height;
        self.save_settings(&settings)
    }

    pub fn set_inspector_pinned(&self, inspector_pinned: bool) -> Result<(), String> {
        let mut settings = self.settings();
        settings.inspector_pinned = inspector_pinned;
        self.save_settings(&settings)
    }

}

fn dir_is_empty(path: &Path) -> Result<bool, String> {
    let mut entries = std::fs::read_dir(path).map_err(|e| e.to_string())?;
    Ok(entries.next().is_none())
}
