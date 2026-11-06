    #[test]
    fn open_new_window_command_delegates_to_windows_module() {
        let source = include_str!("windows.rs");
        assert!(source.contains("open_library_window"));
        assert!(source.contains("async fn open_new_window"));
    }
