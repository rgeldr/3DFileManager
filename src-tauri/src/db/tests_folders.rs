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
            .list_files(FolderFilter::Id(nested.id), "", "", "", "name", "asc")
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
            .list_files(FolderFilter::Id(source.id), "", "", "", "name", "asc")
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
            .list_files(FolderFilter::Id(source.id), "", "", "", "name", "asc")
            .unwrap();
        assert!(moved.iter().all(|file| file.stored_relpath.starts_with("Dest/Source/")));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn rename_folder_with_moves_the_directory_and_rewrites_paths() {
        use std::sync::atomic::AtomicBool;
        let dir = std::env::temp_dir().join(format!("filelib-rename-folder-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let db = open(&dir).unwrap();
        let root = dir.join("library");
        std::fs::create_dir_all(&root).unwrap();
        let mut settings = Settings::default();
        settings.library_root = Some(root.to_string_lossy().to_string());
        db.save_settings(&settings).unwrap();
        let minis = db.create_folder(None, "Minis", 0).unwrap();
        std::fs::write(root.join("Minis").join("a.stl"), b"solid").unwrap();
        let file_id = db
            .insert_file("a.stl", "Minis/a.stl", "stl", 5, "sha-a", 1, Some(minis.id), None)
            .unwrap();
        let cancelled = db.rename_folder_with(minis.id, "Terrain", &AtomicBool::new(false), |_| {}).unwrap();
        assert!(!cancelled);
        assert!(root.join("Terrain").join("a.stl").is_file());
        assert!(!root.join("Minis").exists());
        assert_eq!(db.folder_relpath(minis.id).unwrap(), "Terrain");
        let row = db
            .list_files(FolderFilter::Id(minis.id), "", "", "", "name", "asc")
            .unwrap();
        assert_eq!(row[0].id, file_id);
        assert!(row[0].stored_relpath.starts_with("Terrain/"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn rename_folder_with_picks_a_unique_name_on_collision() {
        use std::sync::atomic::AtomicBool;
        let dir = std::env::temp_dir().join(format!("filelib-rename-collision-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let db = open(&dir).unwrap();
        let root = dir.join("library");
        std::fs::create_dir_all(&root.join("Terrain")).unwrap();
        let mut settings = Settings::default();
        settings.library_root = Some(root.to_string_lossy().to_string());
        db.save_settings(&settings).unwrap();
        let minis = db.create_folder(None, "Minis", 0).unwrap();
        std::fs::create_dir_all(root.join("Minis")).unwrap();
        let cancelled = db.rename_folder_with(minis.id, "Terrain", &AtomicBool::new(false), |_| {}).unwrap();
        assert!(!cancelled);
        let rel = db.folder_relpath(minis.id).unwrap();
        assert!(rel.starts_with("Terrain"));
        assert_ne!(rel, "Terrain");
        assert!(root.join(&rel).is_dir());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn rewrite_moved_tree_rewrites_nested_catalog_paths() {
        let (dir, db) = scratch_db("rewrite-tree");
        let dest = db.create_folder(None, "Dest", 0).unwrap();
        let source = db.create_folder(None, "Source", 0).unwrap();
        let nested = db.create_folder(Some(source.id), "Nested", 0).unwrap();
        let other = db.create_folder(None, "Other", 0).unwrap();
        let top = db
            .insert_file("a.stl", "Source/a.stl", "stl", 1, "sha-a", 1, Some(source.id), None)
            .unwrap();
        let child = db
            .insert_file("b.stl", "Source/Nested/b.stl", "stl", 2, "sha-b", 2, Some(nested.id), None)
            .unwrap();
        let outside = db
            .insert_file("c.stl", "Other/c.stl", "stl", 3, "sha-c", 3, Some(other.id), None)
            .unwrap();

        let mut last = None;
        db.rewrite_moved_tree(
            "Source",
            "Dest/Source",
            source.id,
            Some(dest.id),
            "Renamed",
            &mut |progress| {
                assert_eq!(progress.name, "Updating catalog");
                assert!(!progress.cancellable);
                assert_eq!(progress.bytes_done, 0);
                assert_eq!(progress.bytes_total, 0);
                last = Some((progress.current, progress.total));
            },
        )
        .unwrap();
        assert_eq!(last, Some((4, 4)));

        let folders = db.list_folders().unwrap();
        let moved = folders.iter().find(|folder| folder.id == source.id).unwrap();
        assert_eq!(moved.parent_id, Some(dest.id));
        assert_eq!(moved.name, "Renamed");
        assert_eq!(moved.relpath, "Dest/Source");
        let nested_row = folders.iter().find(|folder| folder.id == nested.id).unwrap();
        assert_eq!(nested_row.parent_id, Some(source.id));
        assert_eq!(nested_row.name, "Nested");
        assert_eq!(nested_row.relpath, "Dest/Source/Nested");
        assert_eq!(db.file_location(top).unwrap().stored_relpath, "Dest/Source/a.stl");
        assert_eq!(db.file_location(child).unwrap().stored_relpath, "Dest/Source/Nested/b.stl");
        assert_eq!(db.file_location(outside).unwrap().stored_relpath, "Other/c.stl");
        assert_eq!(db.file_location(child).unwrap().folder_id, Some(nested.id));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn relocate_folder_moves_disk_and_undoes_a_catalog_conflict() {
        let (dir, db) = scratch_db("relocate-folder");
        let root = db.library_root().unwrap();
        let alpha = db.create_folder(None, "Alpha", 0).unwrap();
        let beta = db.create_folder(None, "Beta", 0).unwrap();
        std::fs::write(root.join("Alpha").join("a.stl"), b"mesh").unwrap();
        let file_id = db
            .insert_file("a.stl", "Alpha/a.stl", "stl", 4, "sha-alpha", 1, Some(alpha.id), None)
            .unwrap();

        let conflict = db
            .rewrite_moved_tree("Alpha", "Beta", alpha.id, None, "Beta", &mut |_| {})
            .unwrap_err();
        assert_eq!(conflict, "UNIQUE constraint failed: folders.relpath");
        assert_eq!(db.folder_relpath(alpha.id).unwrap(), "Alpha");
        assert_eq!(db.file_location(file_id).unwrap().stored_relpath, "Alpha/a.stl");
        assert!(root.join("Alpha/a.stl").is_file());

        std::fs::remove_dir_all(root.join("Beta")).unwrap();
        let undone = db
            .relocate_folder(
                alpha.id,
                None,
                "Beta",
                &root,
                "Alpha",
                "Beta",
                &AtomicBool::new(false),
                false,
                |_| {},
            )
            .unwrap_err();
        assert_eq!(undone, "UNIQUE constraint failed: folders.relpath");
        assert!(root.join("Alpha/a.stl").is_file());
        assert!(!root.join("Beta").exists());
        assert_eq!(db.folder_relpath(alpha.id).unwrap(), "Alpha");
        assert_eq!(db.folder_relpath(beta.id).unwrap(), "Beta");
        assert_eq!(db.file_location(file_id).unwrap().stored_relpath, "Alpha/a.stl");

        let missing = db
            .relocate_folder(
                alpha.id,
                None,
                "Ghost",
                &root,
                "does-not-exist",
                "Ghost",
                &AtomicBool::new(false),
                false,
                |_| {},
            )
            .unwrap_err();
        assert!(missing.contains("was not found on disk"));
        assert!(missing.contains("does-not-exist"));
        assert_eq!(db.folder_relpath(alpha.id).unwrap(), "Alpha");

        let shelf = db.create_folder(None, "Shelf", 0).unwrap();
        let moved = db
            .relocate_folder(
                alpha.id,
                Some(shelf.id),
                "Alpha",
                &root,
                "Alpha",
                "Shelf/Alpha",
                &AtomicBool::new(false),
                false,
                |_| {},
            )
            .unwrap();
        assert!(!moved);
        assert!(root.join("Shelf/Alpha/a.stl").is_file());
        assert!(!root.join("Alpha").exists());
        assert_eq!(db.folder_relpath(alpha.id).unwrap(), "Shelf/Alpha");
        assert_eq!(db.file_location(file_id).unwrap().stored_relpath, "Shelf/Alpha/a.stl");

        let cancel = AtomicBool::new(true);
        let cancelled = db
            .relocate_folder(
                alpha.id,
                None,
                "Alpha",
                &root,
                "Shelf/Alpha",
                "Alpha",
                &cancel,
                true,
                |_| {},
            )
            .unwrap();
        assert!(cancelled);
        assert!(root.join("Shelf/Alpha/a.stl").is_file());
        assert!(!root.join("Alpha").exists());
        assert_eq!(db.folder_relpath(alpha.id).unwrap(), "Shelf/Alpha");
        let _ = std::fs::remove_dir_all(&dir);
    }
