    use crate::import;
    use std::path::PathBuf;

    #[test]
    fn join_import_relative_paths_combines_prefix_and_parent_rel() {
        use std::path::Path;
        assert_eq!(
            import::join_import_relative_paths(Path::new(""), Path::new("nested")),
            PathBuf::from("nested")
        );
        assert_eq!(
            import::join_import_relative_paths(Path::new("Models"), Path::new("")),
            PathBuf::from("Models")
        );
        assert_eq!(
            import::join_import_relative_paths(Path::new("Models"), Path::new("batch")),
            PathBuf::from("Models/batch")
        );
    }

    #[test]
    fn import_path_within_root_requires_a_common_canonical_ancestor() {
        use std::fs;
        use std::sync::atomic::{AtomicU64, Ordering};
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let n = NEXT.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!(
            "filelib-import-within-{}-{n}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let root = dir.join("library");
        fs::create_dir_all(&root).unwrap();
        let inside = root.join("part.stl");
        fs::write(&inside, b"x").unwrap();
        let outside = dir.join("outside.stl");
        fs::write(&outside, b"y").unwrap();
        assert!(import::import_path_within_root(&inside, &root));
        assert!(!import::import_path_within_root(&outside, &root));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn hash_file_hashes_and_reports_missing_files() {
        use std::fs;
        use std::sync::atomic::{AtomicU64, Ordering};
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let n = NEXT.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!(
            "filelib-import-hash-{}-{n}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("hash-me.stl");
        fs::write(&file, b"solid hash\nendsolid hash\n").unwrap();
        let digest = import::hash_file(&file).unwrap();
        assert_eq!(digest.len(), 64);
        let missing = import::hash_file(&dir.join("nope.stl"));
        assert!(missing.is_err());
        let _ = fs::remove_dir_all(&dir);
    }
