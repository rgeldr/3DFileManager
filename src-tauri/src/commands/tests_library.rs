    fn scratch_library(label: &str) -> (std::path::PathBuf, db::AppDb) {
        use std::sync::atomic::{AtomicU64, Ordering};
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let n = NEXT.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "filelib-libcmd-{label}-{}-{n}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        let db = db::open(&dir).unwrap();
        let root = dir.join("library");
        std::fs::create_dir_all(&root).unwrap();
        (dir, db)
    }

    #[test]
    fn bootstrap_work_reports_empty_library_before_root_is_set() {
        let (dir, db) = scratch_library("boot");
        let boot = bootstrap_work(&db).unwrap();
        assert!(boot.settings.library_root.is_none());
        assert!(boot.folders.is_empty());
        drop(db);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn set_library_root_work_seeds_folders_and_stats() {
        let (dir, db) = scratch_library("seed");
        let root = dir.join("library");
        let boot = set_library_root_work(&db, &root).unwrap();
        let stored = crate::settings::stored_path(&root.canonicalize().unwrap());
        assert_eq!(boot.settings.library_root.as_deref(), Some(stored.as_str()));
        assert!(!stored.starts_with(r"\\?\"));
        let stats = library_stats_work(&db).unwrap();
        assert_eq!(stats.file_count, 0);
        let folder = add_library_folder(&db, None, "Prints").unwrap();
        assert_eq!(folder.name, "Prints");
        drop(db);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn set_library_root_work_rejects_a_second_root() {
        let (dir, db) = scratch_library("twice");
        let root = dir.join("library");
        set_library_root_work(&db, &root).unwrap();
        let err = set_library_root_work(&db, &dir.join("other")).unwrap_err();
        assert!(err.contains("already set"), "{err}");
        drop(db);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn rescan_library_work_catalogs_a_new_on_disk_file() {
        use std::sync::atomic::AtomicBool;
        let (dir, db) = scratch_library("rescan");
        let root = dir.join("library");
        set_library_root_work(&db, &root).unwrap();
        std::fs::write(root.join("fresh.stl"), b"solid").unwrap();
        let summary = rescan_library_work(&db, &AtomicBool::new(false), |_| {}).unwrap();
        assert!(summary.added_files >= 1, "added={}", summary.added_files);
        drop(db);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn rescan_folder_work_only_touches_that_subtree() {
        use std::sync::atomic::AtomicBool;
        let (dir, db) = scratch_library("rescan-folder");
        let root = dir.join("library");
        set_library_root_work(&db, &root).unwrap();
        let toys = add_library_folder(&db, None, "Toys").unwrap();
        let _other = add_library_folder(&db, None, "Shelf").unwrap();
        std::fs::create_dir_all(root.join("Toys")).unwrap();
        std::fs::write(root.join("Toys").join("new.stl"), b"x").unwrap();
        std::fs::write(root.join("Shelf").join("old.stl"), b"y").unwrap();
        let summary = rescan_folder_work(&db, toys.id, &AtomicBool::new(false), |_| {}).unwrap();
        assert!(summary.added_files >= 1, "added={}", summary.added_files);
        let toys_rows: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM files WHERE stored_relpath LIKE 'Toys/%'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let shelf_rows: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM files WHERE stored_relpath LIKE 'Shelf/%'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(toys_rows >= 1, "toys={toys_rows}");
        assert_eq!(shelf_rows, 0);
        drop(db);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn rename_and_move_folder_work_update_the_catalog_path() {
        use std::sync::atomic::AtomicBool;
        let (dir, db) = scratch_library("folder-move");
        let root = dir.join("library");
        set_library_root_work(&db, &root).unwrap();
        let parent = add_library_folder(&db, None, "Parent").unwrap();
        let child = add_library_folder(&db, None, "Child").unwrap();
        let cancel = AtomicBool::new(false);
        assert!(!rename_folder_work(&db, child.id, "Kid", &cancel, |_| {}).unwrap());
        assert_eq!(db.folder_relpath(child.id).unwrap(), "Kid");
        assert!(!move_folder_work(&db, child.id, Some(parent.id), &cancel, |_| {}).unwrap());
        assert_eq!(db.folder_relpath(child.id).unwrap(), "Parent/Kid");
        drop(db);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn move_library_root_work_points_settings_at_the_new_folder() {
        use std::sync::atomic::AtomicBool;
        let (dir, db) = scratch_library("move-root");
        let root = dir.join("library");
        set_library_root_work(&db, &root).unwrap();
        std::fs::write(root.join("part.stl"), b"mesh").unwrap();
        let dest = dir.join("moved");
        std::fs::create_dir_all(&dest).unwrap();
        let cancelled = move_library_root_work(&db, &dest, &AtomicBool::new(false), |_| {}).unwrap();
        assert!(!cancelled);
        assert!(dest.join("part.stl").is_file());
        let stored = db.library_root().unwrap();
        assert!(!stored.to_string_lossy().starts_with(r"\\?\"));
        drop(db);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn export_library_backup_work_writes_a_catalog_outside_the_library() {
        use std::sync::atomic::AtomicBool;
        let (dir, db) = scratch_library("export");
        let root = dir.join("library");
        set_library_root_work(&db, &root).unwrap();
        std::fs::write(root.join("part.stl"), b"mesh").unwrap();
        let backup = dir.join("backup");
        std::fs::create_dir_all(&backup).unwrap();
        let cancelled = export_library_backup_work(&db, &backup, &AtomicBool::new(false), |_| {}).unwrap();
        assert!(!cancelled);
        assert!(backup.join("library.db").is_file());
        assert!(backup.join("manifest.json").is_file());
        let missing = dir.join("missing-backup");
        let err = export_library_backup_work(&db, &missing, &AtomicBool::new(false), |_| {}).unwrap_err();
        assert!(err.contains("empty folder"), "{err}");
        drop(db);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn delete_folder_work_removes_an_empty_folder() {
        let (dir, db) = scratch_library("del-folder");
        let root = dir.join("library");
        set_library_root_work(&db, &root).unwrap();
        let folder = add_library_folder(&db, None, "Empty").unwrap();
        delete_folder_work(&db, folder.id).unwrap();
        assert!(db.folder_id_by_relpath("Empty").unwrap().is_none());
        drop(db);
        let _ = std::fs::remove_dir_all(&dir);
    }
