
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

