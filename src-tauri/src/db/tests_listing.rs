
    #[test]
    fn fts_prefix_and_underscore_tokens() {
        let dir = std::env::temp_dir().join(format!("filelib-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let db = open(&dir).unwrap();
        let root = dir.join("library");
        std::fs::create_dir_all(&root).unwrap();
        let mut settings = Settings::default();
        settings.library_root = Some(root.to_string_lossy().to_string());
        db.save_settings(&settings).unwrap();
        let id = db
            .insert_file(
                "Throne_of_Baal.stl",
                "Throne_of_Baal.stl",
                "stl",
                10,
                "abc",
                1,
                None,
                None,
            )
            .unwrap();
        let found = db
            .list_files(FolderFilter::All, "thro", "", "", "name", "asc")
            .unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].id, id);
        assert_eq!(found[0].sort_name, "Throne of Baal");
        assert_eq!(found[0].mtime, 1);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn fts_trigger_tracks_search_columns_only() {
        let dir = std::env::temp_dir().join(format!(
            "filelib-fts-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        {
            let db = open(&dir).unwrap();
            db.conn
                .execute_batch(
                    "DROP TRIGGER IF EXISTS files_au;
                     CREATE TRIGGER files_au AFTER UPDATE ON files BEGIN
                         INSERT INTO files_fts(files_fts, rowid, sort_name, original_name, creator, notes, tags_text)
                         VALUES ('delete', old.id, old.sort_name, old.original_name, old.creator, old.notes, old.tags_text);
                         INSERT INTO files_fts(rowid, sort_name, original_name, creator, notes, tags_text)
                         VALUES (new.id, new.sort_name, new.original_name, new.creator, new.notes, new.tags_text);
                     END;",
                )
                .unwrap();
            db.conn.pragma_update(None, "user_version", 2).unwrap();
        }
        let db = open(&dir).unwrap();
        let sql: String = db
            .conn
            .query_row(
                "SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'files_au'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(
            sql.contains("UPDATE OF sort_name, original_name, creator, notes, tags_text"),
            "{sql}"
        );
        let id = db
            .insert_file("Gate.stl", "Gate.stl", "stl", 10, "abc", 1, None, None)
            .unwrap();
        db.conn
            .execute("UPDATE files SET notes = 'beacon' WHERE id = ?1", [id])
            .unwrap();
        let found = db
            .list_files(FolderFilter::All, "beacon", "", "", "name", "asc")
            .unwrap();
        assert_eq!(found.len(), 1);
        db.conn
            .execute(
                "UPDATE files SET thumb_status = 'ok', size_bytes = 99, mtime = 5 WHERE id = ?1",
                [id],
            )
            .unwrap();
        let still = db
            .list_files(FolderFilter::All, "beacon", "", "", "name", "asc")
            .unwrap();
        assert_eq!(still.len(), 1);
        assert_eq!(still[0].notes, "beacon");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn sort_by_size_mtime_and_date_added() {
        let dir = std::env::temp_dir().join(format!("filelib-sort-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let db = open(&dir).unwrap();
        let root = dir.join("library");
        std::fs::create_dir_all(&root).unwrap();
        let mut settings = Settings::default();
        settings.library_root = Some(root.to_string_lossy().to_string());
        db.save_settings(&settings).unwrap();
        db.insert_file("a.stl", "a.stl", "stl", 100, "sha", 10, None, None)
            .unwrap();
        db.insert_file("b.stl", "b.stl", "stl", 50, "shb", 20, None, None)
            .unwrap();
        let by_size = db
            .list_files(FolderFilter::All, "", "", "", "size", "desc")
            .unwrap();
        assert_eq!(by_size[0].size_bytes, 100);
        assert_eq!(by_size[1].size_bytes, 50);
        let by_mtime = db
            .list_files(FolderFilter::All, "", "", "", "modified", "asc")
            .unwrap();
        assert_eq!(by_mtime[0].mtime, 10);
        assert_eq!(by_mtime[1].mtime, 20);
        let by_date = db
            .list_files(FolderFilter::All, "", "", "", "date", "desc")
            .unwrap();
        assert!(by_date[0].imported_at >= by_date[1].imported_at);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn push_folder_scope_tag_ids_and_sort_order() {
        assert_eq!(super::unique_tag_ids(&[]), Vec::<i64>::new());
        assert_eq!(super::unique_tag_ids(&[2, 2, 1, 2, 3, 1]), vec![2, 1, 3]);

        let mut sql = String::from("WHERE 1=1");
        let mut params = Vec::new();
        super::push_tag_ids(&mut sql, &mut params, &[], TagMatch::Any);
        assert_eq!(sql, "WHERE 1=1");
        assert!(params.is_empty());
        super::push_tag_ids(&mut sql, &mut params, &[4, 4, 9], TagMatch::Any);
        assert_eq!(
            sql,
            "WHERE 1=1 AND f.id IN (SELECT file_id FROM file_tags WHERE tag_id IN (?,?))"
        );
        assert_eq!(params, vec!["4".to_string(), "9".to_string()]);

        let mut all_sql = String::new();
        let mut all_params = Vec::new();
        super::push_tag_ids(&mut all_sql, &mut all_params, &[3, 3], TagMatch::All);
        assert_eq!(
            all_sql,
            " AND f.id IN (SELECT file_id FROM file_tags WHERE tag_id IN (?) GROUP BY file_id HAVING COUNT(DISTINCT tag_id) = CAST(? AS INTEGER))"
        );
        assert_eq!(all_params, vec!["3".to_string(), "1".to_string()]);

        assert!(super::sort_is_ascending("name", "asc"));
        assert!(!super::sort_is_ascending("size", "desc"));
        assert!(super::sort_is_ascending("name", ""));
        assert!(super::sort_is_ascending("creator", "nope"));
        assert!(!super::sort_is_ascending("size", ""));
        assert!(super::sort_is_ascending("date", "asc"));
        assert!(!super::sort_is_ascending("modified", "sideways"));

        let order = |sort: &str, direction: &str| {
            let mut sql = String::new();
            super::push_sort_order(&mut sql, sort, direction);
            sql
        };
        assert_eq!(order("name", "asc"), " ORDER BY f.sort_name COLLATE NOCASE");
        assert_eq!(order("name", "desc"), " ORDER BY f.sort_name COLLATE NOCASE DESC");
        assert_eq!(order("other", "desc"), " ORDER BY f.sort_name COLLATE NOCASE DESC");
        assert_eq!(
            order("creator", ""),
            " ORDER BY f.creator COLLATE NOCASE ASC, f.sort_name COLLATE NOCASE ASC"
        );
        assert_eq!(
            order("date", "desc"),
            " ORDER BY f.imported_at DESC, f.sort_name COLLATE NOCASE ASC"
        );
        assert_eq!(
            order("size", "asc"),
            " ORDER BY f.size_bytes ASC, f.sort_name COLLATE NOCASE ASC"
        );
        assert_eq!(
            order("modified", ""),
            " ORDER BY f.mtime DESC, f.sort_name COLLATE NOCASE ASC"
        );

        let scope = |folder: FolderFilter| {
            let mut sql = String::from("WHERE 1=1");
            let mut params = Vec::new();
            super::push_folder_scope(&mut sql, &mut params, folder);
            (sql, params)
        };
        assert_eq!(scope(FolderFilter::All), ("WHERE 1=1".into(), Vec::new()));
        assert_eq!(
            scope(FolderFilter::Root),
            ("WHERE 1=1 AND f.folder_id IS NULL".into(), Vec::new())
        );
        assert_eq!(
            scope(FolderFilter::Id(7)),
            ("WHERE 1=1 AND f.folder_id = ?".into(), vec!["7".to_string()])
        );
        assert_eq!(
            scope(FolderFilter::Subtree(3)),
            (
                "WHERE 1=1 AND f.folder_id IN (WITH RECURSIVE sub(id) AS (SELECT ? UNION ALL SELECT fo.id FROM folders fo INNER JOIN sub ON fo.parent_id = sub.id) SELECT id FROM sub)".into(),
                vec!["3".to_string()]
            )
        );
    }

    #[test]
    fn tags_for_ids_and_hydrate_with_tags() {
        let (dir, db) = scratch_db("hydrate-tags");
        let root = db.library_root().unwrap();
        let first = db
            .insert_file("a.stl", "a.stl", "stl", 1, "sha-a", 1, None, None)
            .unwrap();
        let second = db
            .insert_file("b.stl", "b.stl", "stl", 1, "sha-b", 1, None, None)
            .unwrap();
        db.set_tags(first, &["zeta".into(), "alpha".into()]).unwrap();
        db.set_tags(second, &["alpha".into()]).unwrap();

        assert!(db.tags_for_ids(&[]).unwrap().is_empty());
        let mut chunk = std::collections::HashMap::new();
        db.tags_for_ids_chunk(&[], &mut chunk).unwrap();
        assert!(chunk.is_empty());
        db.tags_for_ids_chunk(&[first], &mut chunk).unwrap();
        assert_eq!(
            chunk.get(&first).unwrap(),
            &vec!["alpha".to_string(), "zeta".to_string()]
        );

        let mut ids = vec![0_i64; 501];
        ids[0] = first;
        ids[500] = second;
        let map = db.tags_for_ids(&ids).unwrap();
        assert_eq!(map.len(), 2);
        assert_eq!(
            map.get(&first).unwrap(),
            &vec!["alpha".to_string(), "zeta".to_string()]
        );
        assert_eq!(map.get(&second).unwrap(), &vec!["alpha".to_string()]);

        let seed = |id: i64, status: &str, sha: &str, missing: bool| super::FileSeed {
            id,
            original_name: "a.stl".into(),
            sort_name: "a".into(),
            stored_relpath: "Models/a.stl".into(),
            ext: "stl".into(),
            size_bytes: 8,
            sha256: sha.into(),
            folder_id: Some(3),
            creator: "Ada".into(),
            notes: "n".into(),
            source_archive: Some("pack.zip".into()),
            imported_at: 11,
            mtime: 22,
            thumb_status: status.into(),
            missing,
        };
        let row = db
            .hydrate_with_tags(seed(5, "ok", "abc", false), &root, vec!["zeta".into()])
            .unwrap();
        assert_eq!(row.id, 5);
        assert_eq!(row.original_name, "a.stl");
        assert_eq!(row.sort_name, "a");
        assert_eq!(row.stored_relpath, "Models/a.stl");
        assert_eq!(row.ext, "stl");
        assert_eq!(row.size_bytes, 8);
        assert_eq!(row.sha256, "abc");
        assert_eq!(row.folder_id, Some(3));
        assert_eq!(row.creator, "Ada");
        assert_eq!(row.notes, "n");
        assert_eq!(row.source_archive.as_deref(), Some("pack.zip"));
        assert_eq!(row.imported_at, 11);
        assert_eq!(row.mtime, 22);
        assert_eq!(row.thumb_status, "ok");
        assert!(!row.missing);
        assert_eq!(row.tags, vec!["zeta".to_string()]);
        assert_eq!(
            row.absolute_path,
            root.join("Models/a.stl").to_string_lossy().to_string()
        );
        assert_eq!(
            row.thumb_path,
            Some(thumb_path(&db.data_dir, "abc").to_string_lossy().to_string())
        );
        let bare = db
            .hydrate_with_tags(seed(6, "ok", "", true), &root, vec![])
            .unwrap();
        assert!(bare.thumb_path.is_none());
        assert!(bare.missing);
        assert!(bare.tags.is_empty());
        let pending = db
            .hydrate_with_tags(seed(7, "none", "abc", false), &root, vec![])
            .unwrap();
        assert!(pending.thumb_path.is_none());
        assert_eq!(pending.thumb_status, "none");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn update_file_with_edits_metadata_and_can_cancel_a_move() {
        let (dir, db) = scratch_db("update-file");
        let root = db.library_root().unwrap();
        std::fs::write(root.join("a.stl"), b"mesh").unwrap();
        let id = db
            .insert_file("a.stl", "a.stl", "stl", 4, "sha-upd", 1, None, None)
            .unwrap();
        let edited = db
            .update_file_with(
                id,
                "  Sorted  ",
                " Ada ",
                " keep ",
                None,
                &AtomicBool::new(false),
                |_| {},
            )
            .unwrap();
        assert!(!edited);
        let row = db
            .list_files(FolderFilter::All, "", "", "", "name", "asc")
            .unwrap()
            .into_iter()
            .find(|file| file.id == id)
            .unwrap();
        assert_eq!(row.sort_name, "Sorted");
        assert_eq!(row.creator, "Ada");
        assert_eq!(row.notes, " keep ");
        assert_eq!(row.stored_relpath, "a.stl");
        assert!(root.join("a.stl").is_file());

        let dest = db.create_folder(None, "Dest", 0).unwrap();
        let moved = db
            .update_file_with(
                id,
                "Other",
                "Bea",
                "moved",
                Some(dest.id),
                &AtomicBool::new(false),
                |_| {},
            )
            .unwrap();
        assert!(!moved);
        let loc = db.file_location(id).unwrap();
        assert_eq!(loc.folder_id, Some(dest.id));
        assert_eq!(loc.stored_relpath, "Dest/a.stl");
        assert!(root.join("Dest/a.stl").is_file());
        assert!(!root.join("a.stl").exists());
        let row = db
            .list_files(FolderFilter::Id(dest.id), "", "", "", "name", "asc")
            .unwrap();
        assert_eq!(row[0].sort_name, "Other");
        assert_eq!(row[0].creator, "Bea");
        assert_eq!(row[0].notes, "moved");

        let cancelled = db
            .update_file_with(
                id,
                "Nope",
                "Nope",
                "no",
                None,
                &AtomicBool::new(true),
                |_| {},
            )
            .unwrap();
        assert!(cancelled);
        let stayed = db.file_location(id).unwrap();
        assert_eq!(stayed.folder_id, Some(dest.id));
        assert_eq!(stayed.stored_relpath, "Dest/a.stl");
        let row = db
            .list_files(FolderFilter::Id(dest.id), "", "", "", "name", "asc")
            .unwrap();
        assert_eq!(row[0].creator, "Bea");
        assert_eq!(row[0].sort_name, "Other");
        assert_eq!(
            db.update_file_with(999_999, "x", "y", "z", None, &AtomicBool::new(false), |_| {})
                .unwrap_err(),
            "File 999999 was not found."
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn push_ext_in_fts_match_and_chrono_now() {
        let mut sql = String::from("WHERE 1=1");
        let mut params = Vec::new();
        super::push_ext_in(&mut sql, &mut params, &["", "exe", "STL", "stl", " jpg ", "pdf"]);
        assert_eq!(sql, "WHERE 1=1 AND lower(f.ext) IN (?,?,?)");
        assert_eq!(
            params,
            vec!["stl".to_string(), "jpg".to_string(), "pdf".to_string()]
        );
        let mut skipped = String::new();
        let mut skipped_params = Vec::new();
        super::push_ext_in(&mut skipped, &mut skipped_params, &["nope", "  "]);
        assert_eq!(skipped, "");
        assert!(skipped_params.is_empty());

        assert_eq!(super::fts_match("  "), None);
        assert_eq!(super::fts_match("***"), None);
        assert_eq!(super::fts_match("hello world"), Some("hello* world*".to_string()));
        assert_eq!(super::fts_match("Gate_1!"), Some("Gate1*".to_string()));

        let before = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let now = super::chrono_now();
        let after = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        assert!(now >= before && now <= after, "{now} not in {before}..={after}");
        assert!(now > 1_700_000_000);
    }

