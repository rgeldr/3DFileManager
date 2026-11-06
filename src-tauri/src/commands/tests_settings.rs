    fn scratch_db() -> (std::path::PathBuf, db::AppDb) {
        let dir = std::env::temp_dir().join(format!("filelib-settings-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let db = db::open(&dir).unwrap();
        (dir, db)
    }

    #[test]
    fn apply_theme_grid_and_search_scope_persist_settings() {
        let (dir, db) = scratch_db();
        apply_theme(&db, "light".into()).unwrap();
        apply_grid_size(&db, "details".into()).unwrap();
        apply_search_scope(&db, "folder".into()).unwrap();
        let settings = get_settings_work(&db);
        assert_eq!(settings.theme, "light");
        assert_eq!(settings.grid_size, "details");
        assert_eq!(settings.search_scope, "folder");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn save_external_programs_persists_normalized_entries() {
        let (dir, db) = scratch_db();
        let path = if cfg!(windows) {
            "C:\\Program Files\\OrcaSlicer\\orca-slicer.exe".to_string()
        } else {
            format!("{}/orca-slicer.exe", std::env::temp_dir().display())
        };
        save_external_programs(
            &db,
            vec![crate::external_programs::ExternalProgram {
                id: "orca".into(),
                name: "OrcaSlicer".into(),
                path,
            }],
        )
        .unwrap();
        assert_eq!(get_settings_work(&db).external_programs.len(), 1);
        assert_eq!(get_settings_work(&db).external_programs[0].id, "orca");
        let _ = std::fs::remove_dir_all(&dir);
    }
