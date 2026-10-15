    #[test]
    fn delete_files_keeps_the_row_when_recycle_fails_and_drops_it_when_recycle_succeeds() {
        let dir = std::env::temp_dir().join(format!("filelib-delete-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let db = db::open(&dir).unwrap();
        let root = dir.join("library");
        fs::create_dir_all(&root).unwrap();
        let mut settings = Settings::default();
        settings.library_root = Some(root.to_string_lossy().to_string());
        db.save_settings(&settings).unwrap();
        fs::write(root.join("keep.stl"), b"keep").unwrap();
        fs::write(root.join("drop.stl"), b"drop").unwrap();
        let keep = db
            .insert_file("keep.stl", "keep.stl", "stl", 4, "sha-keep", 1, None, None)
            .unwrap();
        let drop_id = db
            .insert_file("drop.stl", "drop.stl", "stl", 4, "sha-drop", 1, None, None)
            .unwrap();
        let items = db.trash_items(&[keep, drop_id]).unwrap();
        let db = Mutex::new(db);
        let cancel = AtomicBool::new(false);
        let failed = recycle_and_drop_files(&db, &items[..1], &cancel, |_| {}, |_| Err("denied".into()));
        assert!(failed.is_err());
        assert!(db.lock().unwrap().file_row_exists(keep).unwrap());
        let removed = recycle_and_drop_files(&db, &items[1..], &cancel, |_| {}, |_| Ok(()));
        assert!(!removed.unwrap());
        assert!(!db.lock().unwrap().file_row_exists(drop_id).unwrap());
        let _ = fs::remove_dir_all(&dir);
    }
