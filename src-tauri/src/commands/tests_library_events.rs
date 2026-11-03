    fn command_body(source: &str, name: &str) -> String {
        let marker = format!("fn {name}");
        let start = source
            .find(&marker)
            .unwrap_or_else(|| panic!("missing {name}"));
        let rest = &source[start..];
        let mut end = rest.len();
        if let Some(pos) = rest.find("\n#[tauri::command]") {
            end = end.min(pos);
        }
        if let Some(pos) = rest[marker.len()..].find("\nfn ") {
            end = end.min(pos + marker.len());
        }
        rest[..end].to_string()
    }

    fn emit_kind(body: &str) -> Option<&'static str> {
        for (token, kind) in [
            ("LibraryChangeKind::Files", "files"),
            ("LibraryChangeKind::Folders", "folders"),
            ("LibraryChangeKind::Tags", "tags"),
            ("LibraryChangeKind::Settings", "settings"),
            ("LibraryChangeKind::All", "all"),
        ] {
            if body.contains(token) {
                return Some(kind);
            }
        }
        None
    }

    #[test]
    fn mutating_commands_emit_one_library_changed_with_the_right_kind() {
        let sources = [
            include_str!("library.rs"),
            include_str!("files.rs"),
            include_str!("settings.rs"),
            include_str!("import_cmd.rs"),
            include_str!("thumbs.rs"),
            include_str!("downloads.rs"),
        ]
        .join("\n");
        let expected = [
            ("import_paths", "all"),
            ("create_folder", "folders"),
            ("rename_folder", "folders"),
            ("delete_folder", "all"),
            ("move_folder", "folders"),
            ("rescan_library", "all"),
            ("restore_library_backup", "all"),
            ("remove_missing", "files"),
            ("rename_file", "files"),
            ("delete_files", "files"),
            ("move_files", "files"),
            ("recycle_paths", "files"),
            ("recycle_last_import", "files"),
            ("set_tags", "tags"),
            ("set_creator_under_folder", "tags"),
            ("set_theme", "settings"),
            ("set_pane_widths", "settings"),
            ("set_downloads_folder", "settings"),
            ("clear_thumbnail_cache", "files"),
        ];
        for (name, kind) in expected {
            let body = command_body(&sources, name);
            assert_eq!(
                body.matches("emit_library_changed").count(),
                1,
                "{name} should emit once"
            );
            assert_eq!(emit_kind(&body), Some(kind), "{name}");
        }
        let export_body = command_body(&sources, "export_library_backup");
        assert!(
            !export_body.contains("emit_library_changed"),
            "backup export does not change library rows"
        );
        assert!(include_str!("../lib.rs").contains("open_new_window"));
        assert!(include_str!("../lib.rs").contains("library-job-idle") || include_str!("runtime.rs").contains("library-job-idle"));
    }
