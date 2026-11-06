    fn scratch_downloads() -> (std::path::PathBuf, db::AppDb) {
        let dir = std::env::temp_dir().join(format!("filelib-dlcmd-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let db = db::open(&dir).unwrap();
        let downloads = dir.join("downloads");
        std::fs::create_dir_all(&downloads).unwrap();
        let sample = downloads.join("model.stl");
        std::fs::write(&sample, b"solid").unwrap();
        let mut settings = Settings::default();
        settings.downloads_folder = Some(crate::settings::stored_path(&downloads));
        db.save_settings(&settings).unwrap();
        (dir, db)
    }

    #[test]
    fn reveal_download_in_folder_resolves_a_file_under_the_saved_root() {
        let (dir, db) = scratch_downloads();
        let rel = if cfg!(windows) {
            "model.stl"
        } else {
            "model.stl"
        };
        let shown = reveal_download_in_folder(&db, rel).unwrap();
        assert!(shown.ends_with("model.stl"), "{}", shown.display());
        let err = reveal_download_in_folder(&db, "../escape.stl").unwrap_err();
        assert!(err.contains("outside") || err.contains("Downloads"), "{err}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn reveal_download_requires_a_configured_folder() {
        let dir = std::env::temp_dir().join(format!("filelib-dl-none-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let db = db::open(&dir).unwrap();
        let err = reveal_download_in_folder(&db, "x.stl").unwrap_err();
        assert!(err.contains("Downloads"), "{err}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn list_downloads_command_reads_settings_and_reveal_stays_inside() {
        let commands = include_str!("downloads.rs");
        let list = commands
            .find("async fn list_downloads")
            .map(|start| &commands[start..commands.len().min(start + 90)])
            .expect("list_downloads");
        assert!(list.starts_with("async fn list_downloads(app: AppHandle)"));
        assert!(!list.contains("path:"));
        assert!(commands.contains("allowed_reveal_target"));
        assert!(commands.contains("crate::downloads::list_downloads(&db)"));
        let lib = include_str!("../lib.rs");
        assert!(lib.contains("reveal_path"));
        assert!(lib.contains("list_downloads"));
        assert!(lib.contains("set_downloads_folder"));
    }
