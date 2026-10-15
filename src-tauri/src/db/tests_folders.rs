    #[test]
    fn move_folder_updates_disk_and_paths() {
        let dir = std::env::temp_dir().join(format!("filelib-movefolder-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let db = open(&dir).unwrap();
        let root = dir.join("library");
        std::fs::create_dir_all(&root).unwrap();
        let mut settings = Settings::default();
        settings.library_root = Some(root.to_string_lossy().to_string());
        db.save_settings(&settings).unwrap();

        let dest = db.create_folder(None, "Dest", 0).unwrap();
        let source = db.create_folder(None, "Source", 0).unwrap();
        let nested = db.create_folder(Some(source.id), "Nested", 0).unwrap();
        let stored = "Source/Nested/part.stl";
        std::fs::write(root.join(stored), b"x").unwrap();
        let file_id = db
            .insert_file("part.stl", stored, "stl", 1, "sha-move", 1, Some(nested.id), None)
            .unwrap();

        db.move_folder(source.id, Some(dest.id)).unwrap();

        assert!(root.join("Dest/Source").is_dir());
        assert!(root.join("Dest/Source/Nested").is_dir());
        assert!(root.join("Dest/Source/Nested/part.stl").is_file());
        assert!(!root.join(&source.relpath).exists());

        let folders = db.list_folders().unwrap();
        let moved = folders.iter().find(|f| f.id == source.id).unwrap();
        assert_eq!(moved.parent_id, Some(dest.id));
        assert_eq!(moved.relpath, "Dest/Source");

        let nested_row = folders.iter().find(|f| f.id == nested.id).unwrap();
        assert_eq!(nested_row.relpath, "Dest/Source/Nested");

        let files = db
            .list_files(FolderFilter::Id(nested.id), "", "", "", "name")
            .unwrap();
        assert_eq!(files[0].id, file_id);
        assert_eq!(files[0].stored_relpath, "Dest/Source/Nested/part.stl");

        assert!(db.move_folder(dest.id, Some(source.id)).is_err());
        assert!(db.move_folder(source.id, Some(source.id)).is_err());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn move_folder_copy_fallback_then_cancel_keeps_source() {
        let dir = std::env::temp_dir().join(format!("filelib-movecopy-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let db = open(&dir).unwrap();
        let root = dir.join("library");
        std::fs::create_dir_all(&root).unwrap();
        let mut settings = Settings::default();
        settings.library_root = Some(root.to_string_lossy().to_string());
        db.save_settings(&settings).unwrap();

        let dest = db.create_folder(None, "Dest", 0).unwrap();
        let source = db.create_folder(None, "Source", 0).unwrap();
        std::fs::write(root.join("Source/a.stl"), b"aaa").unwrap();
        std::fs::write(root.join("Source/b.stl"), b"bbb").unwrap();
        db.insert_file("a.stl", "Source/a.stl", "stl", 3, "sha-a", 1, Some(source.id), None)
            .unwrap();
        db.insert_file("b.stl", "Source/b.stl", "stl", 3, "sha-b", 1, Some(source.id), None)
            .unwrap();

        let cancel = AtomicBool::new(false);
        let cancelled = db
            .move_folder_with(source.id, Some(dest.id), &cancel, true, |progress| {
                if progress.current >= 1 {
                    cancel.store(true, std::sync::atomic::Ordering::SeqCst);
                }
            })
            .unwrap();
        assert!(cancelled);
        assert!(root.join("Source/a.stl").is_file());
        assert!(root.join("Source/b.stl").is_file());
        assert!(!root.join("Dest/Source").exists());
        let files = db
            .list_files(FolderFilter::Id(source.id), "", "", "", "name")
            .unwrap();
        assert!(files.iter().any(|file| file.stored_relpath == "Source/a.stl"));
        assert!(files.iter().any(|file| file.stored_relpath == "Source/b.stl"));

        assert!(!db
            .move_folder_with(source.id, Some(dest.id), &AtomicBool::new(false), true, |_| {})
            .unwrap());
        assert!(root.join("Dest/Source/a.stl").is_file());
        assert!(root.join("Dest/Source/b.stl").is_file());
        assert!(!root.join("Source").exists());
        let moved = db
            .list_files(FolderFilter::Id(source.id), "", "", "", "name")
            .unwrap();
        assert!(moved.iter().all(|file| file.stored_relpath.starts_with("Dest/Source/")));

        let _ = std::fs::remove_dir_all(&dir);
    }
