    use std::sync::atomic::{AtomicU64, Ordering};

    fn unique_temp_dir(label: &str) -> std::path::PathBuf {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let n = NEXT.fetch_add(1, Ordering::SeqCst);
        std::env::temp_dir().join(format!(
            "filelib-dlcmd-{label}-{}-{n}",
            std::process::id()
        ))
    }

    fn scratch_downloads(label: &str) -> (std::path::PathBuf, db::AppDb) {
        let dir = unique_temp_dir(label);
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let db = db::open(&dir).unwrap();
        let downloads = dir.join("downloads");
        std::fs::create_dir_all(&downloads).unwrap();
        std::fs::write(downloads.join("model.stl"), b"solid").unwrap();
        crate::downloads::set_downloads_folder(&db, Some(downloads.to_string_lossy().to_string()))
            .unwrap();
        (dir, db)
    }

    #[test]
    fn reveal_download_in_folder_resolves_a_file_under_the_saved_root() {
        let (dir, db) = scratch_downloads("reveal");
        let sample = dir.join("downloads").join("model.stl");
        let shown = reveal_download_in_folder(&db, &sample.to_string_lossy()).unwrap();
        assert!(shown.ends_with("model.stl"), "{}", shown.display());
        assert!(!shown.starts_with(r"\\?\"));
        let outside = dir.join("escape.stl");
        std::fs::write(&outside, b"nope").unwrap();
        let err = reveal_download_in_folder(&db, &outside.to_string_lossy()).unwrap_err();
        assert!(err.contains("outside"), "{err}");
        drop(db);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn reveal_download_requires_a_configured_folder() {
        let dir = unique_temp_dir("reveal-none");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let db = db::open(&dir).unwrap();
        let err = reveal_download_in_folder(&db, "x.stl").unwrap_err();
        assert!(err.contains("Downloads"), "{err}");
        drop(db);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn list_and_set_downloads_work_use_the_saved_folder() {
        let (dir, db) = scratch_downloads("list-set");
        let listed = list_downloads_work(&db).unwrap();
        let crate::downloads::ListDownloadsResult::Ok { rows, .. } = listed else {
            panic!("expected Ok downloads list, got {listed:?}");
        };
        assert!(rows.iter().any(|row| row.name == "model.stl"));
        let other = dir.join("downloads2");
        std::fs::create_dir_all(&other).unwrap();
        let settings =
            set_downloads_folder_work(&db, Some(other.to_string_lossy().to_string())).unwrap();
        assert!(settings.downloads_folder.as_ref().is_some_and(|p| p.contains("downloads2")));
        let empty = list_downloads_work(&db).unwrap();
        match empty {
            crate::downloads::ListDownloadsResult::Ok { rows, truncated } => {
                assert!(!truncated, "unexpected truncation");
                assert!(
                    rows.is_empty(),
                    "fresh downloads folder should have no model rows: {rows:?}"
                );
            }
            other => panic!(
                "expected Ok empty list after switching downloads folder, got {other:?}; \
                 saved={:?}",
                settings.downloads_folder
            ),
        }
        drop(db);
        let _ = std::fs::remove_dir_all(&dir);
    }
