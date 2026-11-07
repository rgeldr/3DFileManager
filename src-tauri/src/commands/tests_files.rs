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

        fs::write(root.join("later.stl"), b"later").unwrap();
        let later = db.lock().unwrap()
            .insert_file("later.stl", "later.stl", "stl", 5, "sha-later", 1, None, None)
            .unwrap();
        let later_items = db.lock().unwrap().trash_items(&[later]).unwrap();
        let cancel_now = AtomicBool::new(true);
        let mut cancel_progress = 0u32;
        let mut cancel_recycled = false;
        let cancelled = recycle_and_drop_files(
            &db,
            &later_items,
            &cancel_now,
            |_| cancel_progress += 1,
            |_| {
                cancel_recycled = true;
                Ok(())
            },
        )
        .unwrap();
        assert!(cancelled);
        assert_eq!(cancel_progress, 0);
        assert!(!cancel_recycled);
        assert!(db.lock().unwrap().file_row_exists(later).unwrap());

        fs::remove_file(root.join("later.stl")).unwrap();
        let cancel_off = AtomicBool::new(false);
        let mut reported = false;
        let mut recycled = false;
        let gone = recycle_and_drop_files(
            &db,
            &later_items,
            &cancel_off,
            |_| reported = true,
            |_| {
                recycled = true;
                Ok(())
            },
        )
        .unwrap();
        assert!(!gone);
        assert!(reported);
        assert!(!recycled);
        assert!(!db.lock().unwrap().file_row_exists(later).unwrap());
        drop(db);
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

    fn scratch_query_library(label: &str) -> (std::path::PathBuf, db::AppDb) {
        use std::sync::atomic::{AtomicU64, Ordering};
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let n = NEXT.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "filelib-query-{label}-{}-{n}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        let db = db::open(&dir).unwrap();
        let root = dir.join("library");
        fs::create_dir_all(&root).unwrap();
        let mut settings = Settings::default();
        settings.library_root = Some(root.to_string_lossy().to_string());
        db.save_settings(&settings).unwrap();
        fs::write(root.join("part.stl"), b"solid").unwrap();
        db.insert_file("part.stl", "part.stl", "stl", 5, "sha-part", 1, None, None)
            .unwrap();
        (dir, db)
    }

    #[test]
    fn query_files_lists_root_entries_and_counts_scope() {
        let (dir, db) = scratch_query_library("list");
        let args: ListFilesArgs = serde_json::from_str(
            r#"{"folder":"root","query":"","creator":"","tag":"","sort":"name"}"#,
        )
        .unwrap();
        let rows = query_files(&db, &args).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].original_name, "part.stl");
        let count = count_files_for_scope_work(&db, None, true).unwrap();
        assert_eq!(count, 1);
        let bad: ListFilesArgs = serde_json::from_str(
            r#"{"folder":"nope","query":"","creator":"","tag":"","sort":"name"}"#,
        )
        .unwrap();
        assert_eq!(query_files(&db, &bad).unwrap_err(), "Unknown folder filter.");
        drop(db);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn query_tag_and_type_counts_and_creators_follow_the_command_filters() {
        let (dir, db) = scratch_query_library("counts");
        let id = db
            .insert_file("hero.stl", "hero.stl", "stl", 4, "sha-hero", 1, None, None)
            .unwrap();
        db.set_tags(id, &["Hero".into()]).unwrap();
        db.set_creator_under_folder(None, "Ada", true).unwrap();
        let tags = query_tag_counts(
            &db,
            &TagCountArgs {
                folder: "all".into(),
                folder_id: None,
                query: String::new(),
                creator: String::new(),
                exts: vec!["stl".into()],
            },
        )
        .unwrap();
        let hero = tags.iter().find(|tag| tag.name == "Hero").unwrap();
        assert_eq!(hero.file_count, 1);
        let types = query_type_counts(
            &db,
            &TypeCountArgs {
                folder: "root".into(),
                folder_id: None,
                query: String::new(),
                creator: "Ada".into(),
                tag_ids: vec![hero.id],
                tag_match: "all".into(),
            },
        )
        .unwrap();
        assert!(types.iter().any(|row| row.id == "stl" && row.file_count == 1));
        let creators = list_creators_for_args(
            &db,
            &ListCreatorsArgs {
                folder: String::new(),
                folder_id: None,
            },
        )
        .unwrap();
        assert_eq!(creators, vec!["Ada".to_string()]);
        let scoped = list_creators_for_args(
            &db,
            &ListCreatorsArgs {
                folder: "id".into(),
                folder_id: None,
            },
        )
        .unwrap_err();
        assert_eq!(scoped, "Missing folder id");
        drop(db);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rename_move_and_update_file_work_touch_disk_and_catalog() {
        use std::sync::atomic::AtomicBool;
        let (dir, db) = scratch_query_library("file-work");
        let root = dir.join("library");
        let id = db
            .conn
            .query_row("SELECT id FROM files WHERE stored_relpath = 'part.stl'", [], |row| row.get(0))
            .unwrap();
        rename_file_work(&db, id, "Renamed.stl").unwrap();
        assert!(root.join("Renamed.stl").is_file());
        let tray = add_library_folder(&db, None, "Tray").unwrap();
        let cancel = AtomicBool::new(false);
        move_files_work(&db, &[id], Some(tray.id), &cancel, |_| {}).unwrap();
        assert!(root.join("Tray").join("Renamed.stl").is_file());
        update_file_work(&db, id, "Renamed.stl", "Ada", "bench", Some(tray.id), &cancel, |_| {}).unwrap();
        let notes: String = db
            .conn
            .query_row("SELECT notes FROM files WHERE id = ?1", [id], |row| row.get(0))
            .unwrap();
        assert_eq!(notes, "bench");
        drop(db);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn delete_files_work_drops_the_catalog_when_recycle_succeeds() {
        use std::sync::atomic::AtomicBool;
        use std::sync::Mutex;
        let (dir, db) = scratch_query_library("delete-work");
        let id = db
            .conn
            .query_row("SELECT id FROM files WHERE stored_relpath = 'part.stl'", [], |row| row.get(0))
            .unwrap();
        let wrapped = Mutex::new(db);
        let cancel = AtomicBool::new(false);
        delete_files_work(&wrapped, &[id], &cancel, |_| {}, |_| Ok(())).unwrap();
        assert!(!wrapped.lock().unwrap().file_row_exists(id).unwrap());
        drop(wrapped);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn delete_files_work_keeps_the_row_when_recycle_fails() {
        use std::sync::atomic::AtomicBool;
        use std::sync::Mutex;
        let (dir, db) = scratch_query_library("delete-fail");
        let id = db
            .conn
            .query_row("SELECT id FROM files WHERE stored_relpath = 'part.stl'", [], |row| row.get(0))
            .unwrap();
        let wrapped = Mutex::new(db);
        let err = delete_files_work(&wrapped, &[id], &AtomicBool::new(false), |_| {}, |_| Err("denied".into()));
        let message = match err {
            Err(message) => message,
            Ok(_) => panic!("recycle failure was ignored"),
        };
        assert!(message.contains("denied"), "{message}");
        assert!(wrapped.lock().unwrap().file_row_exists(id).unwrap());
        drop(wrapped);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn recycle_paths_work_skips_a_missing_file_and_stops_when_cancelled() {
        use std::sync::atomic::AtomicBool;
        let cancel = AtomicBool::new(false);
        let mut seen = 0u32;
        let outcome = recycle_paths_work(
            &[String::from("definitely-missing-part.stl")],
            &[],
            &cancel,
            |_| seen += 1,
        )
        .unwrap();
        assert!(!outcome.cancelled);
        assert!(outcome.failed.is_empty());
        assert!(seen >= 1);

        let cancel_now = AtomicBool::new(true);
        let mut seen_cancel = 0u32;
        let cancelled = recycle_paths_work(
            &[String::from("definitely-missing-part.stl")],
            &[],
            &cancel_now,
            |_| seen_cancel += 1,
        )
        .unwrap();
        assert!(cancelled.cancelled);
        assert!(cancelled.failed.is_empty());
        assert_eq!(seen_cancel, 0);
    }

    #[test]
    fn tag_helpers_update_rows_and_drop_absent_files() {
        let (dir, db) = scratch_query_library("tags");
        let id = db
            .conn
            .query_row("SELECT id FROM files WHERE stored_relpath = 'part.stl'", [], |row| row.get(0))
            .unwrap();
        replace_file_tags(&db, id, &["Hero".into()]).unwrap();
        assert!(catalog_tags(&db).unwrap().iter().any(|name| name == "Hero"));
        assert_eq!(tags_on_files(&db, &[id], &["Villain".into()]).unwrap(), 1);
        assert!(tags_under_folder(&db, None, &["Extra".into()]).unwrap() >= 1);
        assign_creator(&db, None, "Ada", true).unwrap();
        bulk_file_meta(&db, &[id], Some("Bea"), None).unwrap();
        let hero = tag_color_rows(&db)
            .unwrap()
            .into_iter()
            .find(|row| row.name == "Hero")
            .unwrap();
        paint_tag(&db, hero.id, Some("#112233")).unwrap();
        paint_tag(&db, hero.id, None).unwrap();
        db.conn
            .execute("UPDATE files SET missing = 1 WHERE id = ?1", [id])
            .unwrap();
        assert_eq!(absent_files(&db).unwrap().len(), 1);
        drop_absent_files(&db).unwrap();
        assert!(absent_files(&db).unwrap().is_empty());
        drop(db);
        let _ = fs::remove_dir_all(&dir);
    }
