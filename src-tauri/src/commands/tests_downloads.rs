    #[test]
    fn list_downloads_command_reads_settings_and_reveal_stays_inside() {
        let commands = include_str!("downloads.rs");
        let list = commands
            .find("async fn list_downloads")
            .map(|start| &commands[start..commands.len().min(start + 90)])
            .expect("list_downloads");
        assert!(list.starts_with("async fn list_downloads(app: AppHandle)"));
        assert!(!list.contains("path:"));
        assert!(commands.contains("allowed_reveal_target"));
        assert!(commands.contains("crate::downloads::list_downloads(&db)"));
        let lib = include_str!("../lib.rs");
        assert!(lib.contains("reveal_path"));
        assert!(lib.contains("list_downloads"));
        assert!(lib.contains("set_downloads_folder"));
    }
