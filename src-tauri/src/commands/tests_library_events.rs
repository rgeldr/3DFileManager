    /// Match `fn {name}` but not `fn {name}_work` or other longer identifiers.
    fn command_fn_start(source: &str, name: &str) -> usize {
        let marker = format!("fn {name}");
        let mut pos = 0usize;
        while let Some(rel) = source[pos..].find(&marker) {
            let start = pos + rel;
            let after = start + marker.len();
            let next = source.as_bytes().get(after).copied();
            let ident_continues = matches!(
                next,
                Some(b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'_')
            );
            if !ident_continues {
                return start;
            }
            pos = after;
        }
        panic!("missing fn {name}");
    }

    fn command_body(source: &str, name: &str) -> String {
        let marker = format!("fn {name}");
        let start = command_fn_start(source, name);
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
    fn shared_command_imports_are_centralized_in_lib_rs() {
        let sources = [
            ("library.rs", include_str!("library.rs")),
            ("settings.rs", include_str!("settings.rs")),
            ("files.rs", include_str!("files.rs")),
            ("import_cmd.rs", include_str!("import_cmd.rs")),
            ("thumbs.rs", include_str!("thumbs.rs")),
            ("downloads.rs", include_str!("downloads.rs")),
            ("windows.rs", include_str!("windows.rs")),
        ];
        for (file, src) in sources {
            assert!(
                !src.contains("use crate::library_events"),
                "{file} should not import library_events (lib.rs owns it)"
            );
            assert!(
                !src.contains("use tauri::WebviewWindow"),
                "{file} should not import WebviewWindow (lib.rs owns it)"
            );
        }
        let lib = include_str!("../lib.rs");
        assert!(lib.contains("use crate::library_events"));
        assert!(lib.contains("use tauri::WebviewWindow"));
    }

    #[test]
    fn command_fn_start_skips_work_helpers_with_the_same_prefix() {
        let sample = "\
pub(crate) fn rename_folder_work(db: &AppDb) -> () {}
#[tauri::command]
async fn rename_folder(app: AppHandle) {}
pub(crate) fn delete_folder_work(db: &AppDb) {}
async fn delete_folder(app: AppHandle) {}
";
        assert!(sample[command_fn_start(sample, "rename_folder")..].starts_with("async fn rename_folder"));
        assert!(sample[command_fn_start(sample, "delete_folder")..].starts_with("async fn delete_folder"));

        let with_emit = "\
pub(crate) fn rename_folder_work() {}\n\
#[tauri::command]\n\
async fn rename_folder() {\n\
    emit_library_changed(&app, LibraryChangeKind::Folders, &source);\n\
}\n\
#[tauri::command]\n\
async fn delete_folder() {\n\
    emit_library_changed(&app, LibraryChangeKind::All, &source);\n\
}\n\
";
        let rename = command_body(with_emit, "rename_folder");
        assert_eq!(rename.matches("emit_library_changed").count(), 1);
        assert_eq!(emit_kind(&rename), Some("folders"));
        assert!(!rename.contains("rename_folder_work"));
        let delete = command_body(with_emit, "delete_folder");
        assert_eq!(delete.matches("emit_library_changed").count(), 1);
        assert_eq!(emit_kind(&delete), Some("all"));
    }

    #[test]
    fn block_on_disk_borrows_the_app_handle() {
        let runtime = include_str!("runtime.rs");
        assert!(
            runtime.contains("async fn block_on_disk<T, F>(app: &AppHandle"),
            "block_on_disk should take &AppHandle so callers can emit after disk work"
        );
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
        assert!(include_str!("runtime.rs").contains("library-job-idle"));
    }

    #[test]
    fn second_launch_opens_a_window_off_the_plugin_thread() {
        let lib = include_str!("../lib.rs");
        let plugin = lib
            .find("tauri_plugin_single_instance::init")
            .expect("single-instance plugin");
        let callback = &lib[plugin..];
        assert!(
            callback.contains("std::thread::spawn"),
            "creating a webview on the plugin's UI-thread callback can deadlock"
        );
        let spawn = callback.find("std::thread::spawn").unwrap();
        assert!(
            callback[spawn..].contains("windows::open_library_window"),
            "the second launch must open a library window in the running process"
        );
    }

    #[test]
    fn disk_guard_clears_the_job_and_emits_idle() {
        let runtime = include_str!("runtime.rs");
        let drop_at = runtime.find("impl Drop for DiskGuard").expect("DiskGuard");
        let body = &runtime[drop_at..];
        assert!(body.contains("disk_running"));
        assert!(body.contains("store(false"));
        assert!(
            body.contains("emit(\"library-job-idle\""),
            "every window clears its busy banner from this event"
        );
    }
