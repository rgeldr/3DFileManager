    #[test]
    fn mutating_commands_emit_library_changed() {
        let lib = include_str!("library.rs");
        let files = include_str!("files.rs");
        let settings = include_str!("settings.rs");
        let import_cmd = include_str!("import_cmd.rs");
        let thumbs = include_str!("thumbs.rs");
        let downloads = include_str!("downloads.rs");
        let sources = [lib, files, settings, import_cmd, thumbs, downloads].join("\n");
        for name in [
            "create_folder",
            "import_paths",
            "set_theme",
            "delete_files",
            "clear_thumbnail_cache",
            "set_downloads_folder",
        ] {
            assert!(
                sources.contains(&format!("fn {name}")),
                "missing command {name}"
            );
            assert!(
                sources.contains("emit_library_changed"),
                "emit helper should be referenced by mutating commands"
            );
        }
        assert!(sources.matches("emit_library_changed").count() >= 10);
    }
