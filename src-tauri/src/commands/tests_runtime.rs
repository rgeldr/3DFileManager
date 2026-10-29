    #[test]
    fn off_ui_returns_the_worker_value_and_its_error() {
        let value = tauri::async_runtime::block_on(off_ui("off_ui_ok", || Ok::<i32, String>(2 + 2))).unwrap();
        assert_eq!(value, 4);
        let message =
            tauri::async_runtime::block_on(off_ui("off_ui_err", || Err::<i32, String>("disk busy".into())))
                .unwrap_err();
        assert_eq!(message, "disk busy");
    }

    #[test]
    fn data_dir_is_the_app_folder_under_the_platform_data_dir() {
        let dir = data_dir();
        assert!(dir.ends_with("3D File Library"), "{}", dir.display());
        match dirs::data_dir() {
            Some(base) => assert_eq!(dir, base.join("3D File Library")),
            None => assert_eq!(dir, PathBuf::from(".").join("3D File Library")),
        }
    }

    #[test]
    fn theme_grid_size_and_search_scope_reject_unknown_values() {
        assert!(validate_theme("dark").is_ok());
        assert!(validate_theme("light").is_ok());
        assert_eq!(validate_theme("blue").unwrap_err(), "Unknown theme.");
        assert!(validate_theme("Dark").is_err());
        assert!(validate_theme("").is_err());

        for size in ["medium", "large", "extraLarge", "list", "details"] {
            assert!(validate_grid_size(size).is_ok(), "{size}");
        }
        assert_eq!(validate_grid_size("small").unwrap_err(), "Unknown grid size.");
        assert!(validate_grid_size("extralarge").is_err());
        assert!(validate_grid_size("").is_err());

        assert!(validate_search_scope("library").is_ok());
        assert!(validate_search_scope("folder").is_ok());
        assert_eq!(validate_search_scope("all").unwrap_err(), "Unknown search scope.");
        assert!(validate_search_scope("Library").is_err());
        assert!(validate_search_scope("").is_err());
    }
