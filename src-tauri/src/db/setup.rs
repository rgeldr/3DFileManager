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


    pub fn set_pane_widths(&self, sidebar_width: u32, inspector_width: u32) -> Result<(), String> {
        settings::check_pane_widths(sidebar_width, inspector_width)?;
        let mut settings = self.settings();
        settings.sidebar_width = sidebar_width;
        settings.inspector_width = inspector_width;
        self.save_settings(&settings)
    }

}
