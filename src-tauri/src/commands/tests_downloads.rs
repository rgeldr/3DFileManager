    fn scratch_downloads() -> (std::path::PathBuf, db::AppDb) {
        let dir = std::env::temp_dir().join(format!("filelib-dlcmd-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let db = db::open(&dir).unwrap();
        let downloads = dir.join("downloads");
        std::fs::create_dir_all(&downloads).unwrap();
        std::fs::write(downloads.join("model.stl"), b"solid").unwrap();
        crate::downloads::set_downloads_folder(&db, Some(downloads.to_string_lossy().to_string()))
            .unwrap();
        (dir, db)
    }

    #[test]
    fn reveal_download_in_folder_resolves_a_file_under_the_saved_root() {
        let (dir, db) = scratch_downloads();
        let sample = dir.join("downloads").join("model.stl");
        let shown = reveal_download_in_folder(&db, &sample.to_string_lossy()).unwrap();
        assert!(shown.ends_with("model.stl"), "{}", shown.display());
        assert!(!shown.starts_with(r"\\?\"));
        let outside = dir.join("escape.stl");
        std::fs::write(&outside, b"nope").unwrap();
        let err = reveal_download_in_folder(&db, &outside.to_string_lossy()).unwrap_err();
        assert!(err.contains("outside"), "{err}");
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
    fn list_and_set_downloads_work_use_the_saved_folder() {
        let (dir, db) = scratch_downloads();
        let listed = list_downloads_work(&db).unwrap();
        let crate::downloads::ListDownloadsResult::Ok { rows, .. } = listed else {
            panic!("expected Ok downloads list");
        };
        assert!(rows.iter().any(|row| row.name == "model.stl"));
        let other = dir.join("downloads2");
        std::fs::create_dir_all(&other).unwrap();
        let settings = set_downloads_folder_work(&db, Some(other.to_string_lossy().to_string())).unwrap();
        assert!(settings.downloads_folder.as_ref().is_some_and(|p| p.contains("downloads2")));
        let empty = list_downloads_work(&db).unwrap();
        let crate::downloads::ListDownloadsResult::Ok { rows, .. } = empty else {
            panic!("expected Ok empty list");
        };
        assert!(rows.is_empty());
        drop(db);
        let _ = std::fs::remove_dir_all(&dir);
    }
