
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
            .list_files(FolderFilter::All, "thro", "", "", "name")
            .unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].id, id);
        assert_eq!(found[0].sort_name, "Throne of Baal");
        let _ = std::fs::remove_dir_all(&dir);
    }

