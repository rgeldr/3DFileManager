    #[test]
    fn record_import_recycle_targets_copies_paths_and_roots() {
        let paths = Mutex::new(Vec::new());
        let roots = Mutex::new(Vec::new());
        let outcome = import::ImportOutcome {
            imported_ids: Vec::new(),
            imported_count: 0,
            duplicate_count: 0,
            unsupported_count: 0,
            failed: Vec::new(),
            recycle_paths: vec!["a.stl".into(), "b.stl".into()],
            recycle_roots: vec!["batch-1".into()],
            cancelled: false,
            pending_hash_count: 0,
        };
        record_import_recycle_targets(&paths, &roots, &outcome);
        assert_eq!(*paths.lock().unwrap(), outcome.recycle_paths);
        assert_eq!(*roots.lock().unwrap(), outcome.recycle_roots);
    }

    #[test]
    fn store_import_cancel_and_disk_cancel_flip_atomic_flags() {
        let import = AtomicBool::new(false);
        let disk = AtomicBool::new(false);
        store_import_cancel(&import);
        store_disk_cancel(&disk);
        assert!(import.load(std::sync::atomic::Ordering::SeqCst));
        assert!(disk.load(std::sync::atomic::Ordering::SeqCst));
    }
