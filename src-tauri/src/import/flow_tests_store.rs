    #[test]
    fn copy_path_when_force_copy() {
        let (data, library, incoming) = scratch();
        let mut db = open(&data).unwrap();
        let boot = db.set_library_root(&library).unwrap();
        let models = boot.folders.iter().find(|f| f.name == "Models").unwrap().id;
        let src = incoming.join("part.stl");
        fs::write(&src, b"solid x\nendsolid x\n").unwrap();
        FORCE_COPY.store(true, Ordering::SeqCst);
        let summary = import_paths(
            &mut db,
            &[src.to_string_lossy().to_string()],
            Some(models),
            &NO_CANCEL,
            |_| {},
        )
        .unwrap();
        FORCE_COPY.store(false, Ordering::SeqCst);
        assert_eq!(summary.imported_count, 1);
        assert_eq!(summary.recycle_paths.len(), 1);
        let rows = db
            .list_files(FolderFilter::Id(models), "", "", "", "name")
            .unwrap();
        assert_eq!(rows.len(), 1);
        assert!(!rows[0].sha256.is_empty());
        let _ = fs::remove_dir_all(data.parent().unwrap());
    }


    #[test]
    fn import_commits_more_than_batch_size() {
        let (data, library, incoming) = scratch();
        let mut db = open(&data).unwrap();
        let boot = db.set_library_root(&library).unwrap();
        let models = boot.folders.iter().find(|f| f.name == "Models").unwrap().id;
        let bulk = incoming.join("bulk");
        fs::create_dir_all(&bulk).unwrap();
        for i in 0..251 {
            fs::write(bulk.join(format!("f{i}.stl")), b"solid x\nendsolid x\n").unwrap();
        }
        let summary = import_paths(
            &mut db,
            &[bulk.to_string_lossy().to_string()],
            Some(models),
            &NO_CANCEL,
            |_| {},
        )
        .unwrap();
        assert_eq!(summary.imported_count, 251);
        assert!(db.conn.is_autocommit());
        let rows = db
            .list_files(FolderFilter::Id(models), "", "", "", "name")
            .unwrap();
        assert_eq!(rows.len(), 251);
        let _ = fs::remove_dir_all(data.parent().unwrap());
    }

    #[test]
    fn hash_pass_drops_duplicate_hard_link() {
        let (data, library, incoming) = scratch();
        let mut db = open(&data).unwrap();
        let boot = db.set_library_root(&library).unwrap();
        let models = boot.folders.iter().find(|f| f.name == "Models").unwrap().id;
        let src = incoming.join("twin.stl");
        fs::write(&src, b"solid same\nendsolid same\n").unwrap();
        import_paths(
            &mut db,
            &[src.to_string_lossy().to_string()],
            Some(models),
            &NO_CANCEL,
            |_| {},
        )
        .unwrap();
        import_paths(
            &mut db,
            &[src.to_string_lossy().to_string()],
            Some(models),
            &NO_CANCEL,
            |_| {},
        )
        .unwrap();
        drain_unhashed(&db).unwrap();
        let rows = db
            .list_files(FolderFilter::Id(models), "", "", "", "name")
            .unwrap();
        assert_eq!(rows.len(), 1);
        let _ = fs::remove_dir_all(data.parent().unwrap());
    }


    #[test]
    fn pdf_imports_from_a_file_folder_and_archive_and_dedupes() {
        let (data, library, incoming) = scratch();
        let mut db = open(&data).unwrap();
        let boot = db.set_library_root(&library).unwrap();
        let models = boot.folders.iter().find(|f| f.name == "Models").unwrap().id;

        struct ResetForceCopy;
        impl Drop for ResetForceCopy {
            fn drop(&mut self) {
                FORCE_COPY.store(false, Ordering::SeqCst);
            }
        }
        let _reset = ResetForceCopy;
        FORCE_COPY.store(true, Ordering::SeqCst);

        let guide_bytes = b"%PDF-1.4\nguide\n%%EOF\n";
        let guide = incoming.join("Assembly Guide.PDF");
        fs::write(&guide, guide_bytes).unwrap();
        let first = import_paths(
            &mut db,
            &[guide.to_string_lossy().to_string()],
            Some(models),
            &NO_CANCEL,
            |_| {},
        )
        .unwrap();
        assert_eq!(first.imported_count, 1, "{:?}", first.failed);
        assert_eq!(first.unsupported_count, 0);
        assert_eq!(first.duplicate_count, 0);
        assert!(first
            .recycle_paths
            .iter()
            .any(|path| path == &guide.to_string_lossy().to_string()));
        assert!(library.join("Models/Assembly Guide.PDF").is_file());
        let rows = db
            .list_files(FolderFilter::Id(models), "", "", "", "name")
            .unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].ext, "pdf");

        let again = import_paths(
            &mut db,
            &[guide.to_string_lossy().to_string()],
            Some(models),
            &NO_CANCEL,
            |_| {},
        )
        .unwrap();
        assert_eq!(again.imported_count, 0);
        assert_eq!(again.duplicate_count, 1);
        assert_eq!(again.unsupported_count, 0);
        assert_eq!(
            db.list_files(FolderFilter::Id(models), "", "", "", "name")
                .unwrap()
                .len(),
            1
        );

        let pack = incoming.join("pack");
        fs::create_dir_all(pack.join("docs")).unwrap();
        fs::write(pack.join("notes.txt"), b"leave me").unwrap();
        fs::write(pack.join("skip.dat"), b"nope").unwrap();
        fs::write(pack.join("docs").join("Assembly Guide.PDF"), guide_bytes).unwrap();
        let fresh = b"%PDF-1.4\nother\n%%EOF\n";
        fs::write(pack.join("docs").join("other.pdf"), fresh).unwrap();
        let folder_import = import_paths(
            &mut db,
            &[pack.to_string_lossy().to_string()],
            Some(models),
            &NO_CANCEL,
            |_| {},
        )
        .unwrap();
        assert_eq!(folder_import.imported_count, 2, "{:?}", folder_import.failed);
        assert_eq!(folder_import.duplicate_count, 1);
        assert_eq!(folder_import.unsupported_count, 1);
        let recycled = |path: &Path| {
            folder_import
                .recycle_paths
                .iter()
                .any(|item| item == &path.to_string_lossy().to_string())
        };
        assert!(recycled(&pack.join("docs").join("other.pdf")));
        assert!(recycled(&pack.join("docs").join("Assembly Guide.PDF")));
        assert!(recycled(&pack.join("notes.txt")));
        assert!(!recycled(&pack.join("skip.dat")));
        assert!(library.join("Models/docs/other.pdf").is_file());
        assert!(library.join("Models/notes.txt").is_file());
        assert!(!library.join("Models/skip.dat").exists());

        let zip_path = incoming.join("Manual.zip");
        {
            let file = File::create(&zip_path).unwrap();
            let mut zip = ZipWriter::new(file);
            zip.start_file("steps/build.pdf", SimpleFileOptions::default())
                .unwrap();
            zip.write_all(b"%PDF-1.4\nbuild\n%%EOF\n").unwrap();
            zip.finish().unwrap();
        }
        let archived = import_paths(
            &mut db,
            &[zip_path.to_string_lossy().to_string()],
            Some(models),
            &NO_CANCEL,
            |_| {},
        )
        .unwrap();
        assert_eq!(archived.imported_count, 1, "{:?}", archived.failed);
        assert_eq!(archived.unsupported_count, 0);
        assert!(library.join("Models/Manual/steps/build.pdf").is_file());
        assert!(archived
            .recycle_paths
            .iter()
            .any(|path| path.ends_with("Manual.zip")));

        let _ = fs::remove_dir_all(data.parent().unwrap());
    }

    #[test]
    fn txt_imports_from_a_file_folder_and_archive_and_dedupes() {
        let (data, library, incoming) = scratch();
        let mut db = open(&data).unwrap();
        let boot = db.set_library_root(&library).unwrap();
        let models = boot.folders.iter().find(|f| f.name == "Models").unwrap().id;

        struct ResetForceCopy;
        impl Drop for ResetForceCopy {
            fn drop(&mut self) {
                FORCE_COPY.store(false, Ordering::SeqCst);
            }
        }
        let _reset = ResetForceCopy;
        FORCE_COPY.store(true, Ordering::SeqCst);

        let note_bytes = b"Line one\nLine two\n";
        let note = incoming.join("Read Me.TXT");
        fs::write(&note, note_bytes).unwrap();
        let first = import_paths(
            &mut db,
            &[note.to_string_lossy().to_string()],
            Some(models),
            &NO_CANCEL,
            |_| {},
        )
        .unwrap();
        assert_eq!(first.imported_count, 1, "{:?}", first.failed);
        assert_eq!(first.unsupported_count, 0);
        assert_eq!(first.duplicate_count, 0);
        assert!(first
            .recycle_paths
            .iter()
            .any(|path| path == &note.to_string_lossy().to_string()));
        assert!(library.join("Models/Read Me.TXT").is_file());
        let rows = db
            .list_files(FolderFilter::Id(models), "", "", "", "name")
            .unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].ext, "txt");

        let again = import_paths(
            &mut db,
            &[note.to_string_lossy().to_string()],
            Some(models),
            &NO_CANCEL,
            |_| {},
        )
        .unwrap();
        assert_eq!(again.imported_count, 0);
        assert_eq!(again.duplicate_count, 1);
        assert_eq!(
            db.list_files(FolderFilter::Id(models), "", "", "", "name")
                .unwrap()
                .len(),
            1
        );

        let pack = incoming.join("notes-pack");
        fs::create_dir_all(pack.join("docs")).unwrap();
        fs::write(pack.join("docs").join("Read Me.TXT"), note_bytes).unwrap();
        fs::write(pack.join("docs").join("extra.txt"), b"fresh note\n").unwrap();
        fs::write(pack.join("docs").join("skip.dat"), b"nope").unwrap();
        let folder_import = import_paths(
            &mut db,
            &[pack.to_string_lossy().to_string()],
            Some(models),
            &NO_CANCEL,
            |_| {},
        )
        .unwrap();
        assert_eq!(folder_import.imported_count, 1, "{:?}", folder_import.failed);
        assert_eq!(folder_import.duplicate_count, 1);
        assert_eq!(folder_import.unsupported_count, 1);
        assert!(folder_import
            .recycle_paths
            .iter()
            .any(|path| path.ends_with("extra.txt")));
        assert!(folder_import
            .recycle_paths
            .iter()
            .any(|path| path.ends_with("Read Me.TXT")));
        assert!(!folder_import
            .recycle_paths
            .iter()
            .any(|path| path.ends_with("skip.dat")));
        assert!(library.join("Models/docs/extra.txt").is_file());
        assert!(!library.join("Models/docs/skip.dat").exists());

        let zip_path = incoming.join("Notes.zip");
        {
            let file = File::create(&zip_path).unwrap();
            let mut zip = ZipWriter::new(file);
            zip.start_file("steps/build.txt", SimpleFileOptions::default())
                .unwrap();
            zip.write_all(b"build notes\n").unwrap();
            zip.finish().unwrap();
        }
        let archived = import_paths(
            &mut db,
            &[zip_path.to_string_lossy().to_string()],
            Some(models),
            &NO_CANCEL,
            |_| {},
        )
        .unwrap();
        assert_eq!(archived.imported_count, 1, "{:?}", archived.failed);
        assert_eq!(archived.unsupported_count, 0);
        assert!(library.join("Models/Notes/steps/build.txt").is_file());
        assert!(archived
            .recycle_paths
            .iter()
            .any(|path| path.ends_with("Notes.zip")));

        let _ = fs::remove_dir_all(data.parent().unwrap());
    }

    #[test]
    fn hash_error_keeps_file_and_continues() {
        let (data, library, incoming) = scratch();
        let mut db = open(&data).unwrap();
        let boot = db.set_library_root(&library).unwrap();
        let models = boot.folders.iter().find(|f| f.name == "Models").unwrap().id;
        db.insert_file_with_thumb_status(
            "ghost.stl",
            "ghost.stl",
            "stl",
            1,
            "",
            0,
            Some(models),
            None,
            "unhashed",
        )
        .unwrap();
        let good = incoming.join("good.stl");
        fs::write(&good, b"solid ok\nendsolid ok\n").unwrap();
        import_paths(
            &mut db,
            &[good.to_string_lossy().to_string()],
            Some(models),
            &NO_CANCEL,
            |_| {},
        )
        .unwrap();
        drain_unhashed(&db).unwrap();
        let ghost = db
            .conn
            .query_row(
                "SELECT thumb_status FROM files WHERE stored_relpath = 'ghost.stl'",
                [],
                |r| r.get::<_, String>(0),
            )
            .unwrap();
        assert_eq!(ghost, "hash_error");
        assert!(!library.join("ghost.stl").exists());
        let rows = db
            .list_files(FolderFilter::Id(models), "", "", "", "name")
            .unwrap();
        assert!(rows.iter().any(|r| r.original_name == "good.stl"));
        let _ = fs::remove_dir_all(data.parent().unwrap());
    }

    #[test]
    fn clear_thumbs_leaves_unhashed() {
        let (data, library, _incoming) = scratch();
        let db = open(&data).unwrap();
        let boot = db.set_library_root(&library).unwrap();
        let models = boot.folders.iter().find(|f| f.name == "Models").unwrap().id;
        db.insert_file_with_thumb_status(
            "wait.stl",
            "Models/wait.stl",
            "stl",
            1,
            "",
            0,
            Some(models),
            None,
            "unhashed",
        )
        .unwrap();
        db.clear_thumbs().unwrap();
        let status: String = db
            .conn
            .query_row(
                "SELECT thumb_status FROM files WHERE stored_relpath = 'Models/wait.stl'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(status, "unhashed");
        let _ = fs::remove_dir_all(data.parent().unwrap());
    }
