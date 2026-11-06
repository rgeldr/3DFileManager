    fn scratch_db(label: &str) -> (std::path::PathBuf, db::AppDb) {
        let dir = std::env::temp_dir().join(format!(
            "filelib-settings-{label}-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        let db = db::open(&dir).unwrap();
        (dir, db)
    }

    #[test]
    fn apply_theme_grid_and_search_scope_persist_settings() {
        let (dir, db) = scratch_db("apply");
        apply_theme(&db, "light".into()).unwrap();
        apply_grid_size(&db, "details".into()).unwrap();
        apply_search_scope(&db, "folder".into()).unwrap();
        let settings = get_settings_work(&db);
        assert_eq!(settings.theme, "light");
        assert_eq!(settings.grid_size, "details");
        assert_eq!(settings.search_scope, "folder");
        assert_eq!(apply_theme(&db, "blue".into()).unwrap_err(), "Unknown theme.");
        assert_eq!(apply_grid_size(&db, "small".into()).unwrap_err(), "Unknown grid size.");
        assert_eq!(
            apply_search_scope(&db, "all".into()).unwrap_err(),
            "Unknown search scope."
        );
        let kept = get_settings_work(&db);
        assert_eq!(kept.theme, "light");
        assert_eq!(kept.grid_size, "details");
        assert_eq!(kept.search_scope, "folder");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn save_external_programs_persists_normalized_entries() {
        let (dir, db) = scratch_db("programs");
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

    #[test]
    fn layout_helpers_persist_panes_and_reject_a_narrow_sidebar() {
        let (dir, db) = scratch_db("layout");
        store_pane_widths(&db, 220, 320).unwrap();
        store_preview_height(&db, 180).unwrap();
        store_inspector_pinned(&db, false).unwrap();
        store_sidebar_pinned(&db, false).unwrap();
        store_details_columns(
            &db,
            settings::DetailsColumns {
                name: 220,
                size: 80,
                modified: 140,
                added: 140,
                creator: 120,
            },
        )
        .unwrap();
        let saved = get_settings_work(&db);
        assert_eq!(saved.sidebar_width, 220);
        assert_eq!(saved.inspector_width, 320);
        assert_eq!(saved.preview_height, 180);
        assert!(!saved.inspector_pinned);
        assert!(!saved.sidebar_pinned);
        assert_eq!(saved.details_columns.name, 220);
        assert!(store_pane_widths(&db, 10, 320).unwrap_err().contains("Sidebar"));
        assert_eq!(get_settings_work(&db).sidebar_width, 220);
        let _ = std::fs::remove_dir_all(&dir);
    }
