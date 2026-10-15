    fn scratch() -> (PathBuf, PathBuf, PathBuf) {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis();
        let base = std::env::temp_dir().join(format!("3dfl-test-{}-{stamp}", std::process::id()));
        let data = base.join("data");
        let library = base.join("library");
        let incoming = base.join("incoming");
        fs::create_dir_all(&data).unwrap();
        fs::create_dir_all(&library).unwrap();
        fs::create_dir_all(&incoming).unwrap();
        (data, library, incoming)
    }

    fn finish_import(db: &mut AppDb, summary: ImportOutcome) -> ImportOutcome {
        let _ = drain_unhashed(db).unwrap();
        summary
    }

    static NO_CANCEL: AtomicBool = AtomicBool::new(false);
