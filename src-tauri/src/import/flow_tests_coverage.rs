    fn blank_summary() -> ImportOutcome {
        ImportOutcome {
            imported_ids: Vec::new(),
            imported_count: 0,
            duplicate_count: 0,
            unsupported_count: 0,
            failed: Vec::new(),
            recycle_paths: Vec::new(),
            recycle_roots: Vec::new(),
            cancelled: false,
            pending_hash_count: 0,
        }
    }

    const VERSION_RAR: &[u8] = &[
        82, 97, 114, 33, 26, 7, 0, 207, 144, 115, 0, 0, 13, 0, 0, 0, 0, 0, 0, 0, 15, 12, 116, 32, 128, 39, 0, 21, 0, 0,
        0, 11, 0, 0, 0, 3, 69, 243, 125, 198, 164, 138, 7, 71, 29, 51, 7, 0, 164, 129, 0, 0, 86, 69, 82, 83, 73, 79, 78,
        12, 0, 143, 236, 138, 69, 204, 35, 200, 72, 8, 131, 98, 254, 95, 221, 92, 83, 136, 240, 114, 196, 61, 123, 0, 64,
        7, 0,
    ];

    #[test]
    fn archive_budget_and_entry_writers_keep_bytes_inside_the_folder() {
        assert_eq!(
            leave_msg("../x.stl"),
            "Archive entry tries to leave the import folder: ../x.stl"
        );

        let mut budget = ExtractBudget::new(ExtractLimits {
            max_entries: 1,
            max_bytes: 10,
        });
        budget.note_entry().unwrap();
        assert_eq!(budget.entries, 1);
        let err = budget.note_entry().unwrap_err();
        assert!(err.contains("too many"), "{err}");

        let mut capped = ExtractBudget::new(ExtractLimits {
            max_entries: 10,
            max_bytes: 4,
        });
        discard_capped(&mut std::io::Cursor::new(&b"abcd"[..]), &mut capped).unwrap();
        assert_eq!(capped.bytes, 4);
        let mut over = ExtractBudget::new(ExtractLimits {
            max_entries: 10,
            max_bytes: 3,
        });
        let err = discard_capped(&mut std::io::Cursor::new(&b"abcd"[..]), &mut over).unwrap_err();
        assert!(err.contains("too large"), "{err}");

        let (data, _library, _incoming) = scratch();
        let dest = data.join("out");
        fs::create_dir_all(&dest).unwrap();
        let out = dest.join("models").join("a.stl");
        prepare_parent(&dest, &out).unwrap();
        assert!(dest.join("models").is_dir());
        let outside = dest.join("..").join("escaped.stl");
        let err = prepare_parent(&dest, &outside).unwrap_err();
        assert!(err.contains("leave the import folder"), "{err}");

        let mut writer = ExtractBudget::new(tiny_limits(10, 100));
        write_archive_entry(
            &dest,
            "models/a.stl",
            false,
            7,
            &mut std::io::Cursor::new(&b"solid a"[..]),
            &mut writer,
        )
        .unwrap();
        assert_eq!(fs::read(dest.join("models").join("a.stl")).unwrap(), b"solid a");
        assert_eq!(writer.bytes, 7);
        write_archive_entry(
            &dest,
            "models/empty",
            true,
            0,
            &mut std::io::Cursor::new(&b"xx"[..]),
            &mut writer,
        )
        .unwrap();
        assert!(dest.join("models").join("empty").is_dir());
        assert_eq!(writer.bytes, 9);
        write_archive_entry(
            &dest,
            ".",
            false,
            0,
            &mut std::io::Cursor::new(&b""[..]),
            &mut writer,
        )
        .unwrap();
        let mut too_big = ExtractBudget::new(tiny_limits(10, 3));
        let err = write_archive_entry(
            &dest,
            "big.stl",
            false,
            100,
            &mut std::io::Cursor::new(&b"abcd"[..]),
            &mut too_big,
        )
        .unwrap_err();
        assert!(err.contains("too large"), "{err}");
        assert!(!dest.join("big.stl").exists());

        #[cfg(unix)]
        {
            let link = dest.join("linked.stl");
            std::os::unix::fs::symlink("/tmp/filelib-outside-link", &link).unwrap();
            let err = write_archive_entry(
                &dest,
                "linked.stl",
                false,
                1,
                &mut std::io::Cursor::new(&b"x"[..]),
                &mut writer,
            )
            .unwrap_err();
            assert!(err.contains("leave the import folder"), "{err}");
            assert!(link.symlink_metadata().unwrap().file_type().is_symlink());
        }

        let _ = fs::remove_dir_all(data.parent().unwrap());
    }

    #[test]
    fn extract_zip_7z_and_rar_write_the_archive_entries() {
        let (data, _library, incoming) = scratch();
        let zip_path = incoming.join("Citadel.zip");
        {
            let file = File::create(&zip_path).unwrap();
            let mut zip = ZipWriter::new(file);
            zip.start_file("walls/Gate.stl", SimpleFileOptions::default())
                .unwrap();
            zip.write_all(b"solid gate\n").unwrap();
            zip.finish().unwrap();
        }
        let zip_dest = data.join("zip");
        fs::create_dir_all(&zip_dest).unwrap();
        extract_zip(&zip_path, &zip_dest, tiny_limits(100, 10_000)).unwrap();
        assert_eq!(fs::read(zip_dest.join("walls").join("Gate.stl")).unwrap(), b"solid gate\n");

        let seven_src = incoming.join("seven-src");
        fs::create_dir_all(seven_src.join("floors")).unwrap();
        fs::write(seven_src.join("floors").join("Tile.obj"), b"o tile\n").unwrap();
        let seven = incoming.join("Outpost.7z");
        sevenz_rust::compress_to_path(&seven_src, &seven).unwrap();
        let seven_dest = data.join("seven");
        fs::create_dir_all(&seven_dest).unwrap();
        extract_7z(&seven, &seven_dest, tiny_limits(100, 10_000)).unwrap();
        assert_eq!(
            fs::read(seven_dest.join("floors").join("Tile.obj")).unwrap(),
            b"o tile\n"
        );

        let rar_path = incoming.join("version.rar");
        fs::write(&rar_path, VERSION_RAR).unwrap();
        let rar_dest = data.join("rar");
        fs::create_dir_all(&rar_dest).unwrap();
        extract_rar(&rar_path, &rar_dest, tiny_limits(100, 10_000)).unwrap();
        assert_eq!(fs::read(rar_dest.join("VERSION")).unwrap(), b"unrar-0.4.0");

        let _ = fs::remove_dir_all(data.parent().unwrap());
    }

    #[test]
    fn import_archive_stores_zip_contents_and_records_a_bad_archive() {
        let (data, library, incoming) = scratch();
        let mut db = open(&data).unwrap();
        db.set_library_root(&library).unwrap();
        let zip_path = incoming.join("Pack.zip");
        {
            let file = File::create(&zip_path).unwrap();
            let mut zip = ZipWriter::new(file);
            zip.start_file("Body.stl", SimpleFileOptions::default()).unwrap();
            zip.write_all(b"solid body\nendsolid body\n").unwrap();
            zip.finish().unwrap();
        }
        let mut folder_cache = FolderCache::new(&db).unwrap();
        let mut batch = ImportBatch::begin(&mut db).unwrap();
        let mut summary = blank_summary();
        let events = std::cell::RefCell::new(Vec::new());
        let mut progress = ImportProgressCtx {
            current: 0,
            total: 1,
            on_progress: |event: ImportProgress| {
                events.borrow_mut().push(event.message);
            },
            pending_message: None,
        };
        import_archive(
            &mut db,
            &library,
            &mut folder_cache,
            &mut batch,
            &zip_path,
            None,
            Path::new(""),
            0,
            &NO_CANCEL,
            &mut summary,
            &mut progress,
        )
        .unwrap();
        assert_eq!(summary.imported_count, 1);
        assert!(summary.failed.is_empty(), "{:?}", summary.failed);
        assert_eq!(
            fs::read(library.join("Pack").join("Body.stl")).unwrap(),
            b"solid body\nendsolid body\n"
        );
        assert_eq!(summary.recycle_paths, vec![zip_path.to_string_lossy().to_string()]);
        assert!(events.borrow().iter().any(|message| message == "Body.stl"));

        let bad = incoming.join("bad.zip");
        fs::write(&bad, b"this is not a zip").unwrap();
        import_archive(
            &mut db,
            &library,
            &mut folder_cache,
            &mut batch,
            &bad,
            None,
            Path::new(""),
            0,
            &NO_CANCEL,
            &mut summary,
            &mut progress,
        )
        .unwrap();
        assert_eq!(summary.imported_count, 1);
        assert_eq!(summary.failed.len(), 1);
        assert!(summary.failed[0].contains("bad.zip"), "{:?}", summary.failed);
        batch.commit(&mut db).unwrap();
        let tmp = data.join("tmp-import");
        if tmp.exists() {
            assert!(fs::read_dir(&tmp).unwrap().next().is_none());
        }
        let _ = fs::remove_dir_all(data.parent().unwrap());
    }

    #[test]
    fn import_progress_emits_ticks_and_adjusts_the_archive_total() {
        let seen = std::cell::RefCell::new(Vec::new());
        let mut ctx = ImportProgressCtx {
            current: 0,
            total: 0,
            on_progress: |progress: ImportProgress| {
                seen.borrow_mut()
                    .push((progress.current, progress.total, progress.message));
            },
            pending_message: Some("stale".into()),
        };
        ctx.emit("Counting files");
        assert!(ctx.pending_message.is_none());
        ctx.total = 4;
        ctx.emit_now("Importing…");
        ctx.tick("a.stl");
        assert_eq!(ctx.current, 1);
        ctx.adjust_total_for_archive_contents(3);
        assert_eq!(ctx.total, 6);
        ctx.pending_message = Some("held".into());
        ctx.flush();
        ctx.flush();
        let seen = seen.borrow();
        assert_eq!(
            seen.as_slice(),
            &[
                (0, 1, "Counting files".to_string()),
                (0, 4, "Importing…".to_string()),
                (1, 4, "a.stl".to_string()),
                (1, 6, "held".to_string()),
            ]
        );
        let manual = ImportProgress {
            current: 1,
            total: 6,
            message: "held".into(),
        };
        assert_eq!(manual.current, seen[3].0);
        assert_eq!(manual.total, seen[3].1);
        assert_eq!(manual.message, seen[3].2);
        drop(seen);
        ctx.total = 0;
        ctx.adjust_total_for_archive_contents(2);
        assert_eq!(ctx.total, 2);
    }

    #[test]
    fn plan_counts_paths_and_imports_a_tree_under_the_library() {
        assert_eq!(join_rel(Path::new(""), Path::new("a/b")), PathBuf::from("a/b"));
        assert_eq!(join_rel(Path::new("pre"), Path::new("")), PathBuf::from("pre"));
        assert_eq!(join_rel(Path::new("pre"), Path::new("a")), Path::new("pre").join("a"));

        let (data, library, incoming) = scratch();
        let mut db = open(&data).unwrap();
        db.set_library_root(&library).unwrap();
        let inside = library.join("Models");
        assert!(path_within(&inside, &library));
        assert!(!path_within(&incoming, &library));
        assert!(!path_within(Path::new("/tmp/filelib-missing-plan-path"), &library));

        let tree = incoming.join("tree");
        fs::create_dir_all(tree.join("sub")).unwrap();
        fs::create_dir_all(tree.join("empty")).unwrap();
        fs::write(tree.join("a.stl"), b"solid a\n").unwrap();
        fs::write(tree.join("sub").join("b.stl"), b"solid b\n").unwrap();
        fs::write(tree.join("notes.dat"), b"skip").unwrap();
        fs::write(incoming.join("only.stl"), b"solid only\n").unwrap();
        let cancel = AtomicBool::new(false);
        assert_eq!(
            count_jobs(&[tree.clone(), incoming.join("only.stl")], &cancel).unwrap(),
            4
        );
        assert_eq!(count_jobs(&[tree.join("empty")], &cancel).unwrap(), 0);
        let early = AtomicBool::new(true);
        assert_eq!(count_jobs(&[tree.clone()], &early).unwrap(), 0);

        let mut cache = FolderCache::new(&db).unwrap();
        assert_eq!(cache.dest_dir(&library, None).unwrap(), library);
        let missing = cache.dest_dir(&library, Some(9_999_999)).unwrap_err();
        assert!(missing.contains("was not found"), "{missing}");
        let chain_err = cache
            .ensure_folder_chain(&mut db, &library, Some(9_999_999), Path::new("Child"))
            .unwrap_err();
        assert!(chain_err.contains("was not found"), "{chain_err}");
        assert_eq!(
            cache
                .ensure_folder_chain(&mut db, &library, None, Path::new(""))
                .unwrap(),
            None
        );
        let walls = cache
            .ensure_folder_chain(&mut db, &library, None, Path::new("Terrain/Walls"))
            .unwrap()
            .unwrap();
        assert_eq!(
            cache.dest_dir(&library, Some(walls)).unwrap(),
            library.join("Terrain").join("Walls")
        );
        assert!(library.join("Terrain").join("Walls").is_dir());
        assert_eq!(
            cache
                .ensure_folder_chain(&mut db, &library, None, Path::new("Terrain/Walls"))
                .unwrap(),
            Some(walls)
        );

        let mut batch = ImportBatch::begin(&mut db).unwrap();
        let mut summary = blank_summary();
        let mut progress = ImportProgressCtx {
            current: 0,
            total: 3,
            on_progress: |event: ImportProgress| {
                let _ = (event.current, event.total);
            },
            pending_message: None,
        };
        import_tree(
            &mut db,
            &library,
            &mut cache,
            &mut batch,
            &tree,
            None,
            Path::new("Imported"),
            None,
            0,
            &NO_CANCEL,
            &mut summary,
            &mut progress,
        )
        .unwrap();
        assert_eq!(summary.imported_count, 2);
        assert_eq!(summary.unsupported_count, 1);
        assert_eq!(summary.recycle_paths.len(), 2);
        assert_eq!(fs::read(library.join("Imported").join("a.stl")).unwrap(), b"solid a\n");
        assert_eq!(
            fs::read(library.join("Imported").join("sub").join("b.stl")).unwrap(),
            b"solid b\n"
        );
        let stopped = AtomicBool::new(true);
        let mut stopped_summary = blank_summary();
        import_tree(
            &mut db,
            &library,
            &mut cache,
            &mut batch,
            &tree,
            None,
            Path::new("Stopped"),
            None,
            0,
            &stopped,
            &mut stopped_summary,
            &mut progress,
        )
        .unwrap();
        assert!(stopped_summary.cancelled);
        assert_eq!(stopped_summary.imported_count, 0);
        batch.commit(&mut db).unwrap();
        let _ = fs::remove_dir_all(data.parent().unwrap());
    }

    #[test]
    fn store_hashes_copies_and_rolls_a_batch_back() {
        struct ResetForceCopy;
        impl Drop for ResetForceCopy {
            fn drop(&mut self) {
                FORCE_COPY.set(false);
            }
        }
        let _reset = ResetForceCopy;

        let (data, library, incoming) = scratch();
        let mut db = open(&data).unwrap();
        db.set_library_root(&library).unwrap();
        let src = incoming.join("part.stl");
        fs::write(&src, b"solid part\n").unwrap();
        assert_eq!(
            hash_file(&src).unwrap(),
            "54adc84365c976b4905b2f2abd991dc668d58319eccb77436fa61f872d1c37a5"
        );
        let missing_hash = hash_file(&incoming.join("missing.stl")).unwrap_err();
        assert!(!missing_hash.is_empty());
        assert_eq!(file_name_of(&src), "part.stl");
        assert_eq!(file_name_of(Path::new("")), "");

        let counted = incoming.join("count");
        fs::create_dir_all(counted.join("n")).unwrap();
        fs::write(counted.join("a.stl"), b"a").unwrap();
        fs::write(counted.join("n").join("b.stl"), b"b").unwrap();
        assert_eq!(count_files_in_dir(&counted), 2);
        assert_eq!(count_files_in_dir(&incoming.join("missing-dir")), 0);

        assert!(!force_copy_enabled());
        FORCE_COPY.set(true);
        assert!(force_copy_enabled());
        FORCE_COPY.set(false);
        assert!(!force_copy_enabled());

        let mut recycle = blank_summary();
        remember_recycle(&mut recycle, &src, false);
        assert!(recycle.recycle_paths.is_empty());
        remember_recycle(&mut recycle, &src, true);
        assert_eq!(recycle.recycle_paths, vec![src.to_string_lossy().to_string()]);

        let mut batch = ImportBatch::begin(&mut db).unwrap();
        batch.inserts = BATCH_SIZE - 1;
        batch.note_insert(&mut db).unwrap();
        assert!(batch.active);
        assert_eq!(batch.inserts, 0);
        assert!(!db.conn.is_autocommit());
        batch.rollback(&mut db);
        assert!(!batch.active);
        assert!(db.conn.is_autocommit());
        batch.rollback(&mut db);
        assert!(db.conn.is_autocommit());

        let mut cache = FolderCache::new(&db).unwrap();
        let mut batch = ImportBatch::begin(&mut db).unwrap();
        let mut summary = blank_summary();
        import_file(
            &mut db,
            &library,
            &mut cache,
            &mut batch,
            &src,
            None,
            Path::new("Bin"),
            None,
            true,
            &mut summary,
        )
        .unwrap();
        assert_eq!(summary.imported_count, 1);
        assert_eq!(summary.recycle_paths.len(), 1);
        assert_eq!(batch.inserts, 1);
        batch.rollback(&mut db);
        let files: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM files", [], |row| row.get(0))
            .unwrap();
        assert_eq!(files, 0);
        assert!(db.folder_id_by_relpath("Bin").unwrap().is_none());

        let mut cache = FolderCache::new(&db).unwrap();
        let mut batch = ImportBatch::begin(&mut db).unwrap();
        let mut summary = blank_summary();
        let folder = cache
            .ensure_folder_chain(&mut db, &library, None, Path::new("Copied"))
            .unwrap();
        let sha = "54adc84365c976b4905b2f2abd991dc668d58319eccb77436fa61f872d1c37a5";
        store_copied_file(
            &mut db,
            &library,
            &mut cache,
            &mut batch,
            &src,
            folder,
            "copied.stl",
            "stl",
            sha,
            Some("pack.zip"),
            false,
            &mut summary,
        )
        .unwrap();
        assert_eq!(summary.imported_count, 1);
        assert!(summary.recycle_paths.is_empty());
        assert_eq!(
            fs::read(library.join("Copied").join("copied.stl")).unwrap(),
            b"solid part\n"
        );
        batch.commit(&mut db).unwrap();
        assert!(db.conn.is_autocommit());
        let rows = db
            .list_files(FolderFilter::All, "", "", "", "name", "asc")
            .unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].original_name, "copied.stl");
        assert_eq!(rows[0].sha256, sha);
        assert_eq!(rows[0].source_archive.as_deref(), Some("pack.zip"));

        let mut failed = blank_summary();
        let mut batch = ImportBatch::begin(&mut db).unwrap();
        store_copied_file(
            &mut db,
            &library,
            &mut cache,
            &mut batch,
            &incoming.join("missing.stl"),
            folder,
            "missing.stl",
            "stl",
            sha,
            None,
            false,
            &mut failed,
        )
        .unwrap();
        assert_eq!(failed.imported_count, 0);
        assert!(failed.failed[0].contains("missing.stl"), "{:?}", failed.failed);
        batch.rollback(&mut db);

        FORCE_COPY.set(true);
        assert!(force_copy_enabled());
        let mut cache = FolderCache::new(&db).unwrap();
        let mut batch = ImportBatch::begin(&mut db).unwrap();
        let mut duplicate = blank_summary();
        import_file(
            &mut db,
            &library,
            &mut cache,
            &mut batch,
            &src,
            None,
            Path::new("ShouldNotExist"),
            None,
            true,
            &mut duplicate,
        )
        .unwrap();
        assert_eq!(duplicate.duplicate_count, 1);
        assert_eq!(duplicate.imported_count, 0);
        assert_eq!(duplicate.recycle_paths, vec![src.to_string_lossy().to_string()]);
        assert!(db.folder_id_by_relpath("ShouldNotExist").unwrap().is_none());
        FORCE_COPY.set(false);

        let notes = incoming.join("notes.dat");
        fs::write(&notes, b"leave").unwrap();
        let mut unsupported = blank_summary();
        import_file(
            &mut db,
            &library,
            &mut cache,
            &mut batch,
            &notes,
            None,
            Path::new(""),
            None,
            true,
            &mut unsupported,
        )
        .unwrap();
        assert_eq!(unsupported.unsupported_count, 1);
        batch.rollback(&mut db);
        let _ = fs::remove_dir_all(data.parent().unwrap());
    }

    #[test]
    fn cleanup_drops_empty_created_dirs_and_emptied_subfolders() {
        let (data, library, incoming) = scratch();
        let mut db = open(&data).unwrap();
        db.set_library_root(&library).unwrap();
        let empty = db.create_folder(None, "EmptyCreated", 0).unwrap();
        let occupied = db.create_folder(None, "HasFile", 0).unwrap();
        fs::write(library.join(&occupied.relpath).join("keep.stl"), b"x").unwrap();
        assert!(dir_is_completely_empty(&library.join(&empty.relpath)));
        assert!(!dir_is_completely_empty(&library.join(&occupied.relpath)));
        assert!(!dir_is_completely_empty(&library.join("missing-cleanup-dir")));
        prune_created_empty_folders(
            &mut db,
            &library,
            &[(occupied.id, occupied.relpath.clone()), (empty.id, empty.relpath.clone())],
        )
        .unwrap();
        assert!(db.folder_id_by_relpath(&occupied.relpath).unwrap().is_some());
        assert!(db.folder_id_by_relpath(&empty.relpath).unwrap().is_none());
        assert!(!library.join(&empty.relpath).exists());
        assert!(library.join(&occupied.relpath).join("keep.stl").is_file());

        let gone = library.join("GoneDir");
        let stay = library.join("StayDir");
        fs::create_dir_all(&gone).unwrap();
        fs::create_dir_all(&stay).unwrap();
        fs::write(stay.join(".keep"), b"k").unwrap();
        remove_empty_created_dirs(&library, &[(1, "GoneDir".into()), (2, "StayDir".into())]);
        assert!(!gone.exists());
        assert!(stay.join(".keep").is_file());

        let root = incoming.join("root");
        let nested = root.join("nested").join("deep");
        fs::create_dir_all(&nested).unwrap();
        let file = nested.join("a.stl");
        fs::write(&file, b"a").unwrap();
        fs::remove_file(&file).unwrap();
        prune_emptied_subfolders(&[file], &[root.to_string_lossy().to_string()]);
        assert!(root.is_dir());
        assert!(!root.join("nested").exists());

        let keep = root.join("keep");
        fs::create_dir_all(&keep).unwrap();
        let hidden_stl = keep.join("part.stl");
        fs::write(&hidden_stl, b"h").unwrap();
        fs::write(keep.join(".hide"), b"s").unwrap();
        fs::remove_file(&hidden_stl).unwrap();
        prune_emptied_subfolders(&[hidden_stl], &[root.to_string_lossy().to_string()]);
        assert!(keep.join(".hide").is_file());
        assert!(root.is_dir());

        let _ = fs::remove_dir_all(data.parent().unwrap());
    }
