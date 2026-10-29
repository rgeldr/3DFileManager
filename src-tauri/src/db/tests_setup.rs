    use crate::settings::DetailsColumns;
    #[test]
    fn settings_setters_round_trip_through_bootstrap() {
        let (dir, db) = scratch_db("setup-setters");
        let cols = DetailsColumns {
            name: 300,
            size: 100,
            modified: 180,
            added: 180,
            creator: 140,
        };
        db.set_pane_widths(300, 280).unwrap();
        db.set_preview_height(222).unwrap();
        db.set_inspector_pinned(true).unwrap();
        db.set_sidebar_pinned(false).unwrap();
        db.set_details_columns(cols).unwrap();
        let boot = db.bootstrap().unwrap();
        assert_eq!(boot.settings.sidebar_width, 300);
        assert_eq!(boot.settings.inspector_width, 280);
        assert_eq!(boot.settings.preview_height, 222);
        assert!(boot.settings.inspector_pinned);
        assert!(!boot.settings.sidebar_pinned);
        assert_eq!(boot.settings.details_columns.name, 300);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn bootstrap_reports_folders_and_missing_count() {
        let (dir, db) = scratch_db("setup-boot");
        let root = dir.join("library");
        db.create_folder(None, "Minis", 0).unwrap();
        let folder = db.list_folders().unwrap().into_iter().find(|f| f.name == "Minis").unwrap();
        std::fs::write(root.join("Minis").join("gone.stl"), b"x").unwrap();
        let id = db
            .insert_file("gone.stl", "Minis/gone.stl", "stl", 1, "sha-gone", 1, Some(folder.id), None)
            .unwrap();
        db.conn
            .execute("UPDATE files SET missing = 1 WHERE id = ?1", [id])
            .unwrap();
        let boot = db.bootstrap().unwrap();
        assert!(boot.folders.iter().any(|f| f.name == "Minis"));
        assert_eq!(boot.missing_count, 1);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn list_tags_returns_each_tag_once_sorted() {
        let (dir, db) = scratch_db("setup-tags");
        db.set_tags(
            db.insert_file("a.stl", "a.stl", "stl", 1, "sha-a", 1, None, None).unwrap(),
            &["zebra".into(), "alpha".into()],
        )
        .unwrap();
        db.set_tags(
            db.insert_file("b.stl", "b.stl", "stl", 1, "sha-b", 1, None, None).unwrap(),
            &["alpha".into()],
        )
        .unwrap();
        let tags = db.list_tags().unwrap();
        assert_eq!(tags, vec!["alpha".to_string(), "zebra".to_string()]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn remove_missing_drops_only_missing_rows() {
        let (dir, db) = scratch_db("setup-missing");
        let keep = db
            .insert_file("keep.stl", "keep.stl", "stl", 1, "sha-k", 1, None, None)
            .unwrap();
        let gone = db
            .insert_file("gone.stl", "gone.stl", "stl", 1, "sha-g", 1, None, None)
            .unwrap();
        db.conn
            .execute("UPDATE files SET missing = 1 WHERE id = ?1", [gone])
            .unwrap();
        db.remove_missing().unwrap();
        assert!(db.file_row_exists(keep).unwrap());
        assert!(!db.file_row_exists(gone).unwrap());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn column_exists_reads_table_info() {
        let (dir, db) = scratch_db("column-exists");
        assert!(super::column_exists(&db.conn, "files", "sha256").unwrap());
        assert!(super::column_exists(&db.conn, "tags", "auto_color").unwrap());
        assert!(super::column_exists(&db.conn, "tags", "custom_color").unwrap());
        assert!(!super::column_exists(&db.conn, "files", "not_a_column").unwrap());
        assert!(!super::column_exists(&db.conn, "no_such_table", "id").unwrap());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn seed_default_folders_inserts_three_folders_once() {
        let (dir, db) = scratch_db("seed-defaults");
        db.seed_default_folders().unwrap();
        let folders = db.list_folders().unwrap();
        assert_eq!(folders.len(), 3);
        assert_eq!(folders[0].name, "FDM Prints");
        assert_eq!(folders[0].relpath, "FDM Prints");
        assert_eq!(folders[0].sort_order, 0);
        assert_eq!(folders[0].parent_id, None);
        assert_eq!(folders[1].name, "Models");
        assert_eq!(folders[1].sort_order, 1);
        assert_eq!(folders[2].name, "Wargaming Terrain");
        assert_eq!(folders[2].sort_order, 2);
        let root = db.library_root().unwrap();
        assert!(root.join("FDM Prints").is_dir());
        assert!(root.join("Models").is_dir());
        assert!(root.join("Wargaming Terrain").is_dir());
        db.seed_default_folders().unwrap();
        assert_eq!(db.list_folders().unwrap().len(), 3);
        let _ = std::fs::remove_dir_all(&dir);

        let (dir, db) = scratch_db("seed-skip");
        db.create_folder(None, "Custom", 4).unwrap();
        db.seed_default_folders().unwrap();
        let only = db.list_folders().unwrap();
        assert_eq!(only.len(), 1);
        assert_eq!(only[0].name, "Custom");
        assert_eq!(only[0].sort_order, 4);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn bootstrap_struct_reports_settings_and_missing_count() {
        let (dir, db) = scratch_db("bootstrap-struct");
        let folder = db.create_folder(None, "Minis", 0).unwrap();
        let id = db
            .insert_file("gone.stl", "Minis/gone.stl", "stl", 1, "sha-boot", 1, Some(folder.id), None)
            .unwrap();
        db.mark_missing(id, true).unwrap();
        let boot: Bootstrap = db.bootstrap().unwrap();
        assert_eq!(boot.missing_count, 1);
        assert_eq!(boot.folders.len(), 1);
        assert_eq!(boot.folders[0].id, folder.id);
        assert_eq!(boot.folders[0].name, "Minis");
        assert_eq!(boot.folders[0].relpath, "Minis");
        let root = boot.settings.library_root.expect("library root");
        assert!(root.contains("library"));
        let _ = std::fs::remove_dir_all(&dir);
    }
