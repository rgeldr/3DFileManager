    fn scratch_db(name: &str) -> (std::path::PathBuf, AppDb) {
        let dir = std::env::temp_dir().join(format!("filelib-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let db = open(&dir).unwrap();
        let root = dir.join("library");
        std::fs::create_dir_all(&root).unwrap();
        let mut settings = Settings::default();
        settings.library_root = Some(root.to_string_lossy().to_string());
        db.save_settings(&settings).unwrap();
        (dir, db)
    }

    fn status_of(db: &AppDb, id: i64) -> (String, i64) {
        db.conn
            .query_row(
                "SELECT thumb_status, thumb_attempts FROM files WHERE id = ?1",
                [id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap()
    }

