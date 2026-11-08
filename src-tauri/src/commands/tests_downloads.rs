    use std::sync::atomic::{AtomicU64, Ordering};

    /// `cargo llvm-cov` runs lib tests in parallel and does not pass
    /// `--test-threads=1`. A pid-only scratch dir is shared by every test in
    /// this process, so one test's `remove_dir_all` deletes another's
    /// `downloads2` after `set_downloads_folder_work` and `list_downloads`
    /// returns `Missing` instead of an empty `Ok`.
    fn unique_temp_dir(label: &str) -> std::path::PathBuf {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let n = NEXT.fetch_add(1, Ordering::SeqCst);
        std::env::temp_dir().join(format!("filelib-dlcmd-{label}-{}-{n}", std::process::id()))
    }

    fn stored_key(path: &str) -> String {
        let stripped = crate::settings::strip_verbatim_prefix(path);
        if cfg!(windows) {
            stripped
                .replace('/', "\\")
                .trim_end_matches('\\')
                .to_ascii_lowercase()
        } else {
            stripped.replace('\\', "/")
        }
    }

    fn assert_matches_stored_path(actual: &str, canonical: &std::path::Path) {
        let via_dunce = crate::settings::stored_path(canonical);
        let via_display = crate::settings::stored_path_os(&canonical.to_string_lossy(), cfg!(windows));
        assert_eq!(
            via_dunce,
            via_display,
            "dunce stored_path and display rules diverged for {}",
            canonical.display()
        );
        assert_eq!(
            stored_key(actual),
            stored_key(&via_dunce),
            "path {actual} != stored form of {}",
            canonical.display()
        );
        assert!(
            !actual.starts_with(r"\\?\"),
            "stored path still has a verbatim prefix: {actual}"
        );
    }

    fn assert_stored_inside(root: &str, file: &str) {
        let root_key = stored_key(root);
        let file_key = stored_key(file);
        let sep = if cfg!(windows) { "\\" } else { "/" };
        assert!(
            file_key.starts_with(&(root_key.clone() + sep)),
            "listed {file} is not inside saved folder {root}"
        );
    }

    fn assert_not_user_downloads(dir: &std::path::Path) {
        let temp = std::env::temp_dir();
        assert!(
            dir.starts_with(&temp),
            "scratch dir {} is not under the temp dir {}",
            dir.display(),
            temp.display()
        );
        if let Some(downloads) = dirs::download_dir() {
            assert!(
                !dir.starts_with(&downloads),
                "scratch dir {} is inside the user Downloads folder {}",
                dir.display(),
                downloads.display()
            );
        }
    }

    fn expect_ok_list(
        result: Result<crate::downloads::ListDownloadsResult, String>,
        what: &str,
    ) -> (Vec<crate::downloads::DownloadRow>, bool) {
        match result {
            Ok(crate::downloads::ListDownloadsResult::Ok { rows, truncated }) => (rows, truncated),
            Ok(other) => panic!("{what}: expected Ok list, got {other:?}"),
            Err(err) => panic!("{what}: list_downloads_work returned Err({err})"),
        }
    }

    fn scratch_downloads(label: &str) -> (std::path::PathBuf, db::AppDb) {
        let dir = unique_temp_dir(label);
        assert_not_user_downloads(&dir);
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
    fn unique_temp_dirs_stay_distinct_across_threads() {
        let (tx, rx) = std::sync::mpsc::channel();
        let handles: Vec<_> = (0..4)
            .map(|_| {
                let tx = tx.clone();
                std::thread::spawn(move || {
                    tx.send(unique_temp_dir("race")).unwrap();
                })
            })
            .collect();
        drop(tx);
        for handle in handles {
            handle.join().unwrap();
        }
        let mut dirs: Vec<_> = rx.into_iter().collect();
        assert_eq!(dirs.len(), 4, "{dirs:?}");
        dirs.sort();
        dirs.dedup();
        assert_eq!(dirs.len(), 4, "parallel scratch dirs collided: {dirs:?}");
        for dir in &dirs {
            assert_not_user_downloads(dir);
        }
    }

    #[test]
    fn reveal_download_in_folder_resolves_a_file_under_the_saved_root() {
        let (dir, db) = scratch_downloads("reveal");
        let sample = dir.join("downloads").join("model.stl");
        let shown = reveal_download_path_work(&db, &sample.to_string_lossy()).unwrap();
        assert!(shown.ends_with("model.stl"), "{}", shown.display());
        assert!(!shown.starts_with(r"\\?\"));
        let outside = dir.join("escape.stl");
        std::fs::write(&outside, b"nope").unwrap();
        let err = reveal_download_path_work(&db, &outside.to_string_lossy()).unwrap_err();
        assert!(err.contains("outside"), "{err}");
        drop(db);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn reveal_download_requires_a_configured_folder() {
        let dir = unique_temp_dir("reveal-none");
        assert_not_user_downloads(&dir);
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let db = db::open(&dir).unwrap();
        let err = reveal_download_path_work(&db, "x.stl").unwrap_err();
        assert!(err.contains("Downloads"), "{err}");
        drop(db);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn list_and_set_downloads_work_use_the_saved_folder() {
        let (dir, db) = scratch_downloads("list-set");
        let (rows, truncated) = expect_ok_list(list_downloads_work(&db), "initial downloads list");
        assert!(!truncated, "unexpected truncation");
        let model = rows
            .iter()
            .find(|row| row.name == "model.stl")
            .unwrap_or_else(|| {
                panic!("initial list missing model.stl: {rows:?}");
            });
        let saved_first = db
            .settings()
            .downloads_folder
            .clone()
            .expect("downloads folder saved");
        assert_stored_inside(&saved_first, &model.absolute_path);
        let sample = dir
            .join("downloads")
            .join("model.stl")
            .canonicalize()
            .unwrap();
        assert_matches_stored_path(&model.absolute_path, &sample);

        let other = dir.join("downloads2");
        std::fs::create_dir_all(&other).unwrap();
        let settings =
            set_downloads_folder_work(&db, Some(other.to_string_lossy().to_string())).unwrap();
        let canonical = other.canonicalize().unwrap();
        let saved = settings.downloads_folder.clone().unwrap_or_else(|| {
            panic!("set_downloads_folder_work returned no downloads folder: {settings:?}");
        });
        assert_matches_stored_path(&saved, &canonical);
        assert_eq!(
            db.settings().downloads_folder.as_deref(),
            Some(saved.as_str()),
            "list_downloads reloads settings from disk"
        );

        let (rows, truncated) = expect_ok_list(
            list_downloads_work(&db),
            &format!("list after switching downloads folder to {saved}"),
        );
        assert!(!truncated, "unexpected truncation");
        assert!(
            rows.is_empty(),
            "fresh downloads folder should have no model rows: {rows:?}"
        );
        drop(db);
        let _ = std::fs::remove_dir_all(&dir);
    }
