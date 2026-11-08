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

    #[test]
    fn import_progress_event_payload_matches_progress_fields() {
        let progress = import::ImportProgress {
            current: 2,
            total: 5,
            message: "Copying".into(),
        };
        let json = import_progress_event_payload(&progress);
        assert_eq!(json["current"], 2);
        assert_eq!(json["total"], 5);
        assert_eq!(json["message"], "Copying");
    }

    #[test]
    fn import_summary_and_stash_helpers_shape_api_results() {
        let paths = Mutex::new(Vec::new());
        let roots = Mutex::new(Vec::new());
        let outcome = import::ImportOutcome {
            imported_ids: vec![1, 2, 3],
            imported_count: 3,
            duplicate_count: 0,
            unsupported_count: 1,
            failed: vec!["bad.obj".into()],
            recycle_paths: vec!["good.stl".into()],
            recycle_roots: vec!["batch".into()],
            cancelled: false,
            pending_hash_count: 2,
        };
        let summary = import_summary_work(&outcome);
        assert_eq!(summary.imported_count, 3);
        assert_eq!(summary.recycle_count, 1);
        assert_eq!(summary.left_in_place, 2);
        let stashed = stash_import_outcome_work(&paths, &roots, &outcome);
        assert_eq!(stashed.pending_hash_count, 2);
        assert_eq!(*paths.lock().unwrap(), outcome.recycle_paths);
        assert_eq!(*roots.lock().unwrap(), outcome.recycle_roots);
    }

    #[test]
    fn import_paths_work_imports_a_supported_file() {
        use std::sync::atomic::{AtomicU64, Ordering};
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let n = NEXT.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!(
            "filelib-importcmd-{}-{n}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let mut db = db::open(&dir).unwrap();
        let root = dir.join("library");
        std::fs::create_dir_all(&root).unwrap();
        db.set_library_root(&root).unwrap();
        let incoming = dir.join("part.stl");
        std::fs::write(&incoming, b"solid part\nendsolid part\n").unwrap();
        let cancel = AtomicBool::new(false);
        let mut events = Vec::new();
        let outcome = import_paths_work(
            &mut db,
            &[incoming.to_string_lossy().into_owned()],
            None,
            &cancel,
            |progress| events.push((progress.current, progress.message.clone())),
        )
        .unwrap();
        assert_eq!(outcome.imported_count, 1);
        assert!(!events.is_empty());
        assert_eq!(import_summary_work(&outcome).imported_count, 1);
        drop(db);
        let _ = std::fs::remove_dir_all(&dir);
    }
