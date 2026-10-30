    #[test]
    fn reveal_path_is_registered_for_show_in_explorer() {
        let source = include_str!("../lib.rs");
        assert!(source.contains("reveal_path"));
        assert!(source.contains("list_downloads"));
        assert!(source.contains("set_downloads_folder"));
    }
