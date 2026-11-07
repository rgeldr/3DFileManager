    fn scratch_library(label: &str) -> (std::path::PathBuf, db::AppDb) {
        let dir = std::env::temp_dir().join(format!(
            "filelib-libcmd-{label}-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        let db = db::open(&dir).unwrap();
        let root = dir.join("library");
        std::fs::create_dir_all(&root).unwrap();
        (dir, db)
    }

    #[test]
    fn bootstrap_work_reports_empty_library_before_root_is_set() {
        let (dir, db) = scratch_library("boot");
        let boot = bootstrap_work(&db).unwrap();
        assert!(boot.settings.library_root.is_none());
        assert!(boot.folders.is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn set_library_root_work_seeds_folders_and_stats() {
        let (dir, db) = scratch_library("seed");
        let root = dir.join("library");
        let boot = set_library_root_work(&db, &root).unwrap();
        let stored = crate::settings::stored_path(&root.canonicalize().unwrap());
        assert_eq!(boot.settings.library_root.as_deref(), Some(stored.as_str()));
        assert!(!stored.starts_with(r"\\?\"));
        let stats = library_stats_work(&db).unwrap();
        assert_eq!(stats.file_count, 0);
        let folder = add_library_folder(&db, None, "Prints").unwrap();
        assert_eq!(folder.name, "Prints");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn set_library_root_work_rejects_a_second_root() {
        let (dir, db) = scratch_library("twice");
        let root = dir.join("library");
        set_library_root_work(&db, &root).unwrap();
        let err = set_library_root_work(&db, &dir.join("other")).unwrap_err();
        assert!(err.contains("already set"), "{err}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn rescan_library_work_catalogs_a_new_on_disk_file() {
        use std::sync::atomic::AtomicBool;
        let (dir, db) = scratch_library("rescan");
        let root = dir.join("library");
        set_library_root_work(&db, &root).unwrap();
        std::fs::write(root.join("fresh.stl"), b"solid").unwrap();
        let summary = rescan_library_work(&db, &AtomicBool::new(false), |_| {}).unwrap();
        assert!(summary.added >= 1, "added={}", summary.added);
        drop(db);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn rescan_folder_work_only_touches_that_subtree() {
        use std::sync::atomic::AtomicBool;
        let (dir, db) = scratch_library("rescan-folder");
        let root = dir.join("library");
        set_library_root_work(&db, &root).unwrap();
        let toys = add_library_folder(&db, None, "Toys").unwrap();
        let _other = add_library_folder(&db, None, "Shelf").unwrap();
        std::fs::create_dir_all(root.join("Toys")).unwrap();
        std::fs::write(root.join("Toys").join("new.stl"), b"x").unwrap();
        std::fs::write(root.join("Shelf").join("old.stl"), b"y").unwrap();
        let summary = rescan_folder_work(&db, toys.id, &AtomicBool::new(false), |_| {}).unwrap();
        assert!(summary.added >= 1, "added={}", summary.added);
        drop(db);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn delete_folder_work_removes_an_empty_folder() {
        let (dir, db) = scratch_library("del-folder");
        let root = dir.join("library");
        set_library_root_work(&db, &root).unwrap();
        let folder = add_library_folder(&db, None, "Empty").unwrap();
        delete_folder_work(&db, folder.id).unwrap();
        assert!(db.folder_id_by_relpath("Empty").unwrap().is_none());
        drop(db);
        let _ = std::fs::remove_dir_all(&dir);
    }
