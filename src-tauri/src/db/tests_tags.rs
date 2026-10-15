    #[test]
    fn add_tags_under_folder_keeps_existing_and_skips_siblings() {
        let dir = std::env::temp_dir().join(format!("filelib-masstag-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let db = open(&dir).unwrap();
        let root = dir.join("library");
        std::fs::create_dir_all(&root).unwrap();
        let mut settings = Settings::default();
        settings.library_root = Some(root.to_string_lossy().to_string());
        db.save_settings(&settings).unwrap();

        let parent = db.create_folder(None, "Parent", 0).unwrap();
        let child = db.create_folder(Some(parent.id), "Child", 0).unwrap();
        let sibling = db.create_folder(None, "Sibling", 0).unwrap();

        let in_parent = db
            .insert_file("a.stl", "a.stl", "stl", 1, "sha1", 1, Some(parent.id), None)
            .unwrap();
        let in_child = db
            .insert_file("b.stl", "b.stl", "stl", 1, "sha2", 1, Some(child.id), None)
            .unwrap();
        let in_sibling = db
            .insert_file("c.stl", "c.stl", "stl", 1, "sha3", 1, Some(sibling.id), None)
            .unwrap();

        db.set_tags(in_parent, &["existing".into()]).unwrap();
        let count = db
            .add_tags_under_folder(Some(parent.id), &["newtag".into()])
            .unwrap();
        assert_eq!(count, 2);

        let parent_row = db
            .list_files(FolderFilter::Id(parent.id), "", "", "", "name")
            .unwrap();
        assert_eq!(parent_row[0].tags, vec!["existing", "newtag"]);

        let child_row = db
            .list_files(FolderFilter::Id(child.id), "", "", "", "name")
            .unwrap();
        assert_eq!(child_row[0].tags, vec!["newtag"]);

        let sibling_row = db
            .list_files(FolderFilter::Id(sibling.id), "", "", "", "name")
            .unwrap();
        assert_eq!(sibling_row[0].tags, Vec::<String>::new());
        assert_eq!(in_sibling, sibling_row[0].id);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn set_creator_respects_subfolders_and_skips_siblings() {
        let (dir, db) = scratch_db("creator");
        let parent = db.create_folder(None, "Parent", 0).unwrap();
        let child = db.create_folder(Some(parent.id), "Child", 0).unwrap();
        let sibling = db.create_folder(None, "Sibling", 0).unwrap();
        let in_parent = db
            .insert_file("a.stl", "Parent/a.stl", "stl", 1, "sha1", 1, Some(parent.id), None)
            .unwrap();
        let in_child = db
            .insert_file("b.stl", "Parent/Child/b.stl", "stl", 1, "sha2", 1, Some(child.id), None)
            .unwrap();
        let in_sibling = db
            .insert_file("c.stl", "Sibling/c.stl", "stl", 1, "sha3", 1, Some(sibling.id), None)
            .unwrap();
        let direct = db
            .set_creator_under_folder(Some(parent.id), "Direct", false)
            .unwrap();
        assert_eq!(direct, 1);
        let creator = |id| {
            db.list_files(FolderFilter::All, "", "", "", "name")
                .unwrap()
                .into_iter()
                .find(|file| file.id == id)
                .unwrap()
                .creator
        };
        assert_eq!(creator(in_parent), "Direct");
        assert_eq!(creator(in_child), "");
        assert_eq!(creator(in_sibling), "");
        let nested = db
            .set_creator_under_folder(Some(parent.id), "Nested", true)
            .unwrap();
        assert_eq!(nested, 2);
        assert_eq!(creator(in_parent), "Nested");
        assert_eq!(creator(in_child), "Nested");
        assert_eq!(creator(in_sibling), "");
        assert_eq!(db.file_location(in_parent).unwrap().stored_relpath, "Parent/a.stl");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn apply_import_meta_updates_only_the_given_ids() {
        let (dir, db) = scratch_db("import-meta");
        let imported = db
            .insert_file("new.stl", "new.stl", "stl", 1, "sha-new", 1, None, None)
            .unwrap();
        let other = db
            .insert_file("old.stl", "old.stl", "stl", 1, "sha-old", 1, None, None)
            .unwrap();
        db.set_tags(other, &["keep".into()]).unwrap();
        db.apply_import_meta(
            &[imported, 999_999],
            Some("Ada"),
            Some(&["Terrain".into(), "FDM".into()]),
        )
        .unwrap();
        let rows = db.list_files(FolderFilter::All, "", "", "", "name").unwrap();
        let imported_row = rows.iter().find(|file| file.id == imported).unwrap();
        let other_row = rows.iter().find(|file| file.id == other).unwrap();
        assert_eq!(imported_row.creator, "Ada");
        assert_eq!(imported_row.tags, vec!["FDM", "Terrain"]);
        assert_eq!(other_row.creator, "");
        assert_eq!(other_row.tags, vec!["keep"]);
        db.apply_import_meta(&[imported], Some("  "), Some(&[])).unwrap();
        let again = db.list_files(FolderFilter::All, "", "", "", "name").unwrap();
        assert_eq!(again.iter().find(|file| file.id == imported).unwrap().creator, "Ada");
        let _ = std::fs::remove_dir_all(&dir);
    }
