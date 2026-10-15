    #[test]
    fn move_files_cancel_keeps_the_rest() {
        let dir = std::env::temp_dir().join(format!("filelib-movefiles-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let db = open(&dir).unwrap();
        let root = dir.join("library");
        std::fs::create_dir_all(&root).unwrap();
        let mut settings = Settings::default();
        settings.library_root = Some(root.to_string_lossy().to_string());
        db.save_settings(&settings).unwrap();
        let dest = db.create_folder(None, "Dest", 0).unwrap();
        std::fs::write(root.join("a.stl"), b"a").unwrap();
        std::fs::write(root.join("b.stl"), b"b").unwrap();
        let first = db
            .insert_file("a.stl", "a.stl", "stl", 1, "sha-1", 1, None, None)
            .unwrap();
        let second = db
            .insert_file("b.stl", "b.stl", "stl", 1, "sha-2", 1, None, None)
            .unwrap();
        let cancel = AtomicBool::new(false);
        let cancelled = db
            .move_files_with(&[first, second], Some(dest.id), &cancel, |progress| {
                if progress.current >= 1 {
                    cancel.store(true, std::sync::atomic::Ordering::SeqCst);
                }
            })
            .unwrap();
        assert!(cancelled);
        let moved = db.file_location(first).unwrap();
        let stayed = db.file_location(second).unwrap();
        assert_eq!(moved.folder_id, Some(dest.id));
        assert!(root.join(&moved.stored_relpath).is_file());
        assert_eq!(stayed.folder_id, None);
        assert!(root.join("b.stl").is_file());
        let _ = std::fs::remove_dir_all(&dir);
    }

