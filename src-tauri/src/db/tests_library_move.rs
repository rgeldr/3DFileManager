    #[test]
    fn move_library_root_renames_and_updates_settings() {
        let dir = std::env::temp_dir().join(format!("filelib-movelib-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let db = open(&dir).unwrap();
        let root = dir.join("library");
        std::fs::create_dir_all(root.join("Models")).unwrap();
        std::fs::write(root.join("Models/part.stl"), b"mesh").unwrap();
        let mut settings = Settings::default();
        settings.library_root = Some(root.to_string_lossy().to_string());
        db.save_settings(&settings).unwrap();
        let folder = db.create_folder(None, "Models", 0).unwrap();
        db.insert_file(
            "part.stl",
            "Models/part.stl",
            "stl",
            4,
            "sha-lib",
            1,
            Some(folder.id),
            None,
        )
        .unwrap();

        let dest = dir.join("moved-library");
        std::fs::create_dir_all(&dest).unwrap();
        let cancelled = db
            .move_library_root(&dest, &AtomicBool::new(false), |_| {})
            .unwrap();
        assert!(!cancelled);
        assert!(!root.exists());
        assert!(dest.join("Models/part.stl").is_file());
        let new_root = db.library_root().unwrap();
        assert_eq!(new_root, dest.canonicalize().unwrap());
        let files = db
            .list_files(FolderFilter::Id(folder.id), "", "", "", "name", "asc")
            .unwrap();
        assert_eq!(files[0].stored_relpath, "Models/part.stl");
        assert!(files[0].absolute_path.contains("moved-library"));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn move_library_root_rejects_non_empty_and_nested_destinations() {
        let dir = std::env::temp_dir().join(format!("filelib-movelib-bad-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let db = open(&dir).unwrap();
        let root = dir.join("library");
        std::fs::create_dir_all(root.join("Models")).unwrap();
        let mut settings = Settings::default();
        settings.library_root = Some(root.to_string_lossy().to_string());
        db.save_settings(&settings).unwrap();

        let nested = root.join("Models");
        let err = db
            .move_library_root(&nested, &AtomicBool::new(false), |_| {})
            .unwrap_err();
        assert!(err.contains("outside the current library"), "{err}");

        let occupied = dir.join("occupied");
        std::fs::create_dir_all(&occupied).unwrap();
        std::fs::write(occupied.join("keep.txt"), b"x").unwrap();
        let err = db
            .move_library_root(&occupied, &AtomicBool::new(false), |_| {})
            .unwrap_err();
        assert!(err.contains("empty"), "{err}");
        assert!(root.join("Models").is_dir());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn move_library_root_copy_cancel_keeps_source_and_settings() {
        let (dir, db) = scratch_db("movelib-cancel");
        let from = db.library_root().unwrap();
        std::fs::write(from.join("a.stl"), b"aaa").unwrap();
        std::fs::write(from.join("b.stl"), b"bbb").unwrap();
        let dest = dir.join("dest");
        std::fs::create_dir_all(&dest).unwrap();
        let cancel = AtomicBool::new(false);
        let cancelled = db
            .move_library_root_with(&dest, &cancel, true, |progress| {
                if progress.current >= 1 {
                    cancel.store(true, std::sync::atomic::Ordering::SeqCst);
                }
            })
            .unwrap();
        assert!(cancelled);
        assert!(from.join("a.stl").is_file());
        assert!(from.join("b.stl").is_file());
        assert_eq!(db.library_root().unwrap(), from.canonicalize().unwrap());
        assert!(dest.is_dir());
        assert!(!dest.join("a.stl").exists());

        let _ = std::fs::remove_dir_all(&dir);
    }
