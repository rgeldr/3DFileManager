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

    fn rename_row(db: &AppDb, id: i64) -> (String, String, String, String) {
        db.conn
            .query_row(
                "SELECT original_name, sort_name, stored_relpath, ext FROM files WHERE id = ?1",
                [id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap()
    }

    #[test]
    fn rename_file_updates_the_disk_name_and_the_catalog() {
        let (dir, db) = scratch_db("rename-file");
        let root = db.library_root().unwrap();
        let folder = db.create_folder(None, "Models", 0).unwrap();
        std::fs::write(root.join(&folder.relpath).join("old.stl"), b"mesh").unwrap();
        let id = db
            .insert_file("old.stl", &format!("{}/old.stl", folder.relpath), "stl", 4, "sha-old", 1, Some(folder.id), None)
            .unwrap();
        db.rename_library_file(id, "New Model").unwrap();
        assert!(!root.join(&folder.relpath).join("old.stl").exists());
        assert_eq!(std::fs::read(root.join(&folder.relpath).join("New Model.stl")).unwrap(), b"mesh");
        assert_eq!(
            rename_row(&db, id),
            (
                "New Model.stl".into(),
                "New Model".into(),
                format!("{}/New Model.stl", folder.relpath),
                "stl".into(),
            )
        );
        db.rename_library_file(id, "New Model.obj").unwrap();
        assert!(root.join(&folder.relpath).join("New Model.obj").is_file());
        assert_eq!(rename_row(&db, id).3, "obj");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn rename_file_refuses_a_collision_an_invalid_name_and_a_missing_file() {
        let (dir, db) = scratch_db("rename-refuse");
        let root = db.library_root().unwrap();
        std::fs::write(root.join("a.stl"), b"a").unwrap();
        std::fs::write(root.join("Taken.STL"), b"taken").unwrap();
        let id = db.insert_file("a.stl", "a.stl", "stl", 1, "sha-a", 1, None, None).unwrap();
        let other = db
            .insert_file("ghost.stl", "ghost.stl", "stl", 1, "sha-g", 1, None, None)
            .unwrap();
        let collision = db.rename_library_file(id, "taken").unwrap_err();
        assert!(collision.contains("already in this folder"));
        assert_eq!(std::fs::read(root.join("a.stl")).unwrap(), b"a");
        assert_eq!(rename_row(&db, id).2, "a.stl");
        let invalid = db.rename_library_file(id, "a:b").unwrap_err();
        assert!(invalid.contains("Windows"));
        assert!(root.join("a.stl").is_file());
        let missing = db.rename_library_file(other, "ghost-renamed").unwrap_err();
        assert!(missing.contains("missing on disk"));
        assert_eq!(rename_row(&db, other).2, "ghost.stl");
        let outside = dir.join("secret.stl");
        std::fs::write(&outside, b"secret").unwrap();
        let escaped = db
            .insert_file("secret.stl", "../secret.stl", "stl", 6, "sha-x", 1, None, None)
            .unwrap();
        assert!(db.rename_library_file(escaped, "safe").is_err());
        assert_eq!(std::fs::read(&outside).unwrap(), b"secret");
        assert!(!root.join("safe.stl").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn failed_catalog_update_rolls_the_rename_back() {
        let dir = std::env::temp_dir().join(format!("filelib-rename-undo-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let source = dir.join("old.stl");
        let dest = dir.join("new.stl");
        std::fs::write(&source, b"mesh").unwrap();
        let err = rename_then(&source, &dest, || Err("database is locked".into())).unwrap_err();
        assert!(err.contains("database is locked"));
        assert_eq!(std::fs::read(&source).unwrap(), b"mesh");
        assert!(!dest.exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

