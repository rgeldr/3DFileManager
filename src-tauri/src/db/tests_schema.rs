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
