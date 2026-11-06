    fn scratch_library() -> (std::path::PathBuf, db::AppDb) {
        let dir = std::env::temp_dir().join(format!("filelib-libcmd-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let db = db::open(&dir).unwrap();
        let root = dir.join("library");
        std::fs::create_dir_all(&root).unwrap();
        (dir, db)
    }

    #[test]
    fn bootstrap_work_reports_empty_library_before_root_is_set() {
        let (dir, db) = scratch_library();
        let boot = bootstrap_work(&db).unwrap();
        assert!(boot.settings.library_root.is_none());
        assert!(boot.folders.is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn set_library_root_work_seeds_folders_and_stats() {
        let (dir, db) = scratch_library();
        let root = dir.join("library");
        let boot = set_library_root_work(&db, &root).unwrap();
        assert_eq!(boot.settings.library_root.as_deref(), Some(root.to_string_lossy().as_ref()));
        let stats = library_stats_work(&db).unwrap();
        assert_eq!(stats.file_count, 0);
        let folder = create_folder_work(&db, None, "Prints").unwrap();
        assert_eq!(folder.name, "Prints");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn set_library_root_work_rejects_a_second_root() {
        let (dir, db) = scratch_library();
        let root = dir.join("library");
        set_library_root_work(&db, &root).unwrap();
        let err = set_library_root_work(&db, &dir.join("other")).unwrap_err();
        assert!(err.contains("already set"), "{err}");
        let _ = std::fs::remove_dir_all(&dir);
    }
