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

    #[test]
    fn trash_items_rejects_a_path_outside_the_library() {
        let dir = std::env::temp_dir().join(format!("filelib-trash-escape-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let db = db::open(&dir).unwrap();
        let root = dir.join("library");
        fs::create_dir_all(&root).unwrap();
        let mut settings = Settings::default();
        settings.library_root = Some(root.to_string_lossy().to_string());
        db.save_settings(&settings).unwrap();
        let secret = dir.join("secret.stl");
        fs::write(&secret, b"secret").unwrap();
        fs::write(root.join("keep.stl"), b"keep").unwrap();
        let keep = db
            .insert_file("keep.stl", "keep.stl", "stl", 4, "sha-keep", 1, None, None)
            .unwrap();
        let outside = db
            .insert_file("secret.stl", "../secret.stl", "stl", 6, "sha-secret", 1, None, None)
            .unwrap();
        let err = match db.trash_items(&[keep, outside]) {
            Err(err) => err,
            Ok(_) => panic!("an outside path was accepted"),
        };
        assert!(err.contains("outside"), "{err}");
        assert!(secret.is_file());
        let items = db.trash_items(&[keep]).unwrap();
        assert_eq!(items.len(), 1);
        assert!(items[0].path.ends_with("keep.stl"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn list_args_default_to_any_tag_match_and_ascending_sort() {
        assert_eq!(default_tag_match(), "any");
        assert_eq!(default_sort_direction(), "asc");
        let omitted: ListFilesArgs = serde_json::from_str(
            r#"{"folder":"root","query":"q","creator":"c","tag":"t","sort":"name"}"#,
        )
        .unwrap();
        assert_eq!(omitted.tag_match, default_tag_match());
        assert_eq!(omitted.sort_direction, default_sort_direction());
        assert!(omitted.tag_ids.is_empty());
        assert!(omitted.exts.is_empty());
        assert_eq!(omitted.offset, 0);
        assert!(omitted.limit.is_none());
        let given: ListFilesArgs = serde_json::from_str(
            r#"{"folder":"all","query":"","creator":"","tag":"","sort":"name","tagMatch":"all","sortDirection":"desc","offset":3,"limit":10}"#,
        )
        .unwrap();
        assert_eq!(given.tag_match, "all");
        assert_eq!(given.sort_direction, "desc");
        assert_eq!(given.offset, 3);
        assert_eq!(given.limit, Some(10));
    }

    fn folder_filter_err(folder: &str, folder_id: Option<i64>) -> String {
        match folder_filter(folder, folder_id) {
            Err(err) => err,
            Ok(_) => panic!("folder filter {folder} was accepted"),
        }
    }

    #[test]
    fn folder_filter_maps_known_scopes_and_rejects_a_missing_id() {
        assert!(matches!(folder_filter("all", None).unwrap(), FolderFilter::All));
        assert!(matches!(folder_filter("root", Some(4)).unwrap(), FolderFilter::Root));
        assert!(matches!(folder_filter("id", Some(7)).unwrap(), FolderFilter::Id(7)));
        assert!(matches!(
            folder_filter("subtree", Some(9)).unwrap(),
            FolderFilter::Subtree(9)
        ));
        assert_eq!(folder_filter_err("id", None), "Missing folder id");
        assert_eq!(folder_filter_err("subtree", None), "Missing folder id");
        assert_eq!(folder_filter_err("nope", Some(1)), "Unknown folder filter.");
        assert_eq!(folder_filter_err("All", None), "Unknown folder filter.");
    }

    #[test]
    fn tag_match_mode_accepts_any_and_all_ignoring_case() {
        assert_eq!(tag_match_mode("any").unwrap(), db::TagMatch::Any);
        assert_eq!(tag_match_mode("").unwrap(), db::TagMatch::Any);
        assert_eq!(tag_match_mode("ANY").unwrap(), db::TagMatch::Any);
        assert_eq!(tag_match_mode("all").unwrap(), db::TagMatch::All);
        assert_eq!(tag_match_mode("All").unwrap(), db::TagMatch::All);
        assert_eq!(tag_match_mode("none").unwrap_err(), "Unknown tag match.");
        assert_eq!(tag_match_mode(" any").unwrap_err(), "Unknown tag match.");
    }
