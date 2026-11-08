    #[test]
    fn schema_column_exists_reflects_pragma_table_info() {
        let dir = std::env::temp_dir().join(format!("filelib-schema-col-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let conn = Connection::open(dir.join("probe.db")).unwrap();
        conn.execute_batch("CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT NOT NULL);")
            .unwrap();
        assert!(schema_column_exists(&conn, "tags", "name").unwrap());
        assert!(!schema_column_exists(&conn, "tags", "auto_color").unwrap());
        drop(conn);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn refresh_thumb_availability_marks_non_renderable_exts() {
        let dir = std::env::temp_dir().join(format!("filelib-thumb-refresh-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let db = crate::db::open(&dir).unwrap();
        let root = dir.join("library");
        std::fs::create_dir_all(&root).unwrap();
        db.set_library_root(&root).unwrap();
        let id_rendering = db
            .insert_file_with_thumb_status("a.stl", "a.stl", "stl", 1, "", 1, None, None, "rendering")
            .unwrap();
        let id_txt = db
            .insert_file_with_thumb_status("notes.txt", "notes.txt", "txt", 1, "", 1, None, None, "none")
            .unwrap();
        refresh_thumb_availability(&db.conn).unwrap();
        let stl: String = db
            .conn
            .query_row("SELECT thumb_status FROM files WHERE id = ?1", [id_rendering], |r| r.get(0))
            .unwrap();
        assert_eq!(stl, "none");
        let txt: String = db
            .conn
            .query_row("SELECT thumb_status FROM files WHERE id = ?1", [id_txt], |r| r.get(0))
            .unwrap();
        assert_eq!(txt, "unavailable");
        drop(db);
        let _ = std::fs::remove_dir_all(&dir);
    }
