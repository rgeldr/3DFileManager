    #[test]
    fn folder_recycle_keeps_unsupported_failed_and_nonempty_dirs() {
        let (data, library, incoming) = scratch();
        let mut db = open(&data).unwrap();
        let boot = db.set_library_root(&library).unwrap();
        let models = boot.folders.iter().find(|f| f.name == "Models").unwrap().id;

        struct ResetForceCopy;
        impl Drop for ResetForceCopy {
            fn drop(&mut self) {
                FORCE_COPY.set(false);
            }
        }
        let _reset = ResetForceCopy;
        FORCE_COPY.set(true);

        let dup_bytes = b"solid dup\nendsolid dup\n";
        let seed = incoming.join("already-in-library.stl");
        fs::write(&seed, dup_bytes).unwrap();
        let seeded = import_paths(
            &mut db,
            &[seed.to_string_lossy().to_string()],
            Some(models),
            &NO_CANCEL,
            |_| {},
        )
        .unwrap();
        assert_eq!(seeded.imported_count, 1, "{:?}", seeded.failed);

        db.insert_file(
            "broken.stl",
            "Models/keep-fail/broken.stl",
            "stl",
            1,
            "not-the-file-hash",
            0,
            Some(models),
            None,
        )
        .unwrap();

        let pack = incoming.join("DropMe");
        let empty_after = incoming.join("EmptyAfter");
        fs::create_dir_all(pack.join("keep-fail")).unwrap();
        fs::create_dir_all(pack.join("mixed")).unwrap();
        fs::create_dir_all(pack.join("only-models").join("deep")).unwrap();
        fs::create_dir_all(pack.join("has-hidden")).unwrap();
        fs::create_dir_all(empty_after.join("nested")).unwrap();

        let good = pack.join("good.stl");
        let dup = pack.join("dup.stl");
        let notes = pack.join("notes.dat");
        let broken = pack.join("keep-fail").join("broken.stl");
        let also = pack.join("keep-fail").join("also.dat");
        let mixed_stl = pack.join("mixed").join("a.stl");
        let mixed_notes = pack.join("mixed").join("notes.dat");
        let deep = pack.join("only-models").join("deep").join("part.stl");
        let hidden_stl = pack.join("has-hidden").join("part.stl");
        let hidden = pack.join("has-hidden").join(".keep");
        let emptied = empty_after.join("nested").join("a.stl");

        fs::write(&good, b"solid good\nendsolid good\n").unwrap();
        fs::write(&dup, dup_bytes).unwrap();
        fs::write(&notes, b"leave me").unwrap();
        fs::write(&broken, b"solid broken\nendsolid broken\n").unwrap();
        fs::write(&also, b"also leave").unwrap();
        fs::write(&mixed_stl, b"solid mixed\nendsolid mixed\n").unwrap();
        fs::write(&mixed_notes, b"stay").unwrap();
        fs::write(&deep, b"solid deep\nendsolid deep\n").unwrap();
        fs::write(&hidden_stl, b"solid hid\nendsolid hid\n").unwrap();
        fs::write(&hidden, b"hidden").unwrap();
        fs::write(&emptied, b"solid empty\nendsolid empty\n").unwrap();

        let summary = import_paths(
            &mut db,
            &[
                pack.to_string_lossy().to_string(),
                empty_after.to_string_lossy().to_string(),
            ],
            Some(models),
            &NO_CANCEL,
            |_| {},
        )
        .unwrap();
        assert!(
            summary.failed.iter().any(|item| item.contains("broken.stl")),
            "{:?}",
            summary.failed
        );
        assert_eq!(summary.imported_count, 5, "{:?}", summary.failed);
        assert_eq!(summary.duplicate_count, 1);
        assert_eq!(summary.unsupported_count, 4);
        let api = summary_for_api(&summary);
        assert_eq!(api.left_in_place, 5);

        let recycled = |path: &Path| {
            summary
                .recycle_paths
                .iter()
                .any(|item| item == &path.to_string_lossy().to_string())
        };
        assert!(recycled(&good));
        assert!(recycled(&dup));
        assert!(recycled(&mixed_stl));
        assert!(recycled(&deep));
        assert!(recycled(&hidden_stl));
        assert!(recycled(&emptied));
        assert!(!recycled(&notes));
        assert!(!recycled(&broken));
        assert!(!recycled(&also));
        assert!(!recycled(&mixed_notes));
        assert!(!recycled(&hidden));
        assert!(!recycled(&pack));
        assert!(!recycled(&empty_after));
        assert!(summary.recycle_paths.iter().all(|path| Path::new(path).is_file()));
        assert_eq!(summary.recycle_paths.len(), 6);
        assert!(summary.recycle_roots.iter().any(|root| root == &pack.to_string_lossy().to_string()));
        assert!(summary
            .recycle_roots
            .iter()
            .any(|root| root == &empty_after.to_string_lossy().to_string()));

        let (failed, cancelled) = recycle_paths_with(
            &summary.recycle_paths,
            &summary.recycle_roots,
            &NO_CANCEL,
            |_| {},
        )
        .unwrap();
        assert!(failed.is_empty(), "{failed:?}");
        assert!(!cancelled);

        assert!(!good.exists());
        assert!(!dup.exists());
        assert!(!mixed_stl.exists());
        assert!(!deep.exists());
        assert!(!hidden_stl.exists());
        assert!(!emptied.exists());
        assert!(notes.is_file());
        assert!(broken.is_file());
        assert!(also.is_file());
        assert!(mixed_notes.is_file());
        assert!(hidden.is_file());
        assert!(pack.is_dir());
        assert!(pack.join("keep-fail").is_dir());
        assert!(pack.join("mixed").is_dir());
        assert!(pack.join("has-hidden").is_dir());
        assert!(!pack.join("only-models").exists());
        assert!(empty_after.is_dir());
        assert!(!empty_after.join("nested").exists());
        assert!(seed.is_file());

        let _ = fs::remove_dir_all(data.parent().unwrap());
    }


    #[test]
    fn duplicate_archive_and_folder_do_not_create_empty_folders() {
        let (data, library, incoming) = scratch();
        let mut db = open(&data).unwrap();
        let boot = db.set_library_root(&library).unwrap();
        let models = boot.folders.iter().find(|f| f.name == "Models").unwrap().id;

        struct ResetForceCopy;
        impl Drop for ResetForceCopy {
            fn drop(&mut self) {
                FORCE_COPY.set(false);
            }
        }
        let _reset = ResetForceCopy;
        FORCE_COPY.set(true);

        let bytes = b"solid dup\nendsolid dup\n";
        let seed = incoming.join("seed.stl");
        fs::write(&seed, bytes).unwrap();
        let seeded = import_paths(
            &mut db,
            &[seed.to_string_lossy().to_string()],
            Some(models),
            &NO_CANCEL,
            |_| {},
        )
        .unwrap();
        assert_eq!(seeded.imported_count, 1, "{:?}", seeded.failed);

        let kept = db.create_folder(Some(models), "Keep Empty", 0).unwrap();
        assert!(library.join(&kept.relpath).is_dir());

        let zip_path = incoming.join("DupPack.zip");
        {
            let file = File::create(&zip_path).unwrap();
            let mut zip = ZipWriter::new(file);
            zip.start_file("sub/seed.stl", SimpleFileOptions::default())
                .unwrap();
            zip.write_all(bytes).unwrap();
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
        assert_eq!(archived.duplicate_count, 1, "{:?}", archived.failed);
        assert_eq!(archived.imported_count, 0);
        assert!(db.folder_id_by_relpath("Models/DupPack").unwrap().is_none());
        assert!(db
            .folder_id_by_relpath("Models/DupPack/sub")
            .unwrap()
            .is_none());
        assert!(!library.join("Models/DupPack").exists());
        assert!(library.join(&kept.relpath).is_dir());

        let pack = incoming.join("FolderPack");
        fs::create_dir_all(pack.join("dups")).unwrap();
        fs::create_dir_all(pack.join("real")).unwrap();
        fs::create_dir_all(pack.join("Keep Empty")).unwrap();
        fs::write(pack.join("dups").join("seed.stl"), bytes).unwrap();
        fs::write(pack.join("Keep Empty").join("seed.stl"), bytes).unwrap();
        fs::write(
            pack.join("real").join("part.stl"),
            b"solid fresh\nendsolid fresh\n",
        )
        .unwrap();
        let folder_import = import_paths(
            &mut db,
            &[pack.to_string_lossy().to_string()],
            Some(models),
            &NO_CANCEL,
            |_| {},
        )
        .unwrap();
        assert_eq!(folder_import.imported_count, 1, "{:?}", folder_import.failed);
        assert_eq!(folder_import.duplicate_count, 2);
        assert!(library.join("Models/real/part.stl").is_file());
        assert!(db.folder_id_by_relpath("Models/real").unwrap().is_some());
        assert!(db.folder_id_by_relpath("Models/dups").unwrap().is_none());
        assert!(!library.join("Models/dups").exists());
        assert!(library.join(&kept.relpath).is_dir());
        assert!(db
            .list_folders()
            .unwrap()
            .iter()
            .all(|folder| folder.name != "DupPack" && folder.name != "dups" && folder.name != "sub"));
        assert_eq!(
            db.folder_id_by_relpath(&kept.relpath).unwrap(),
            Some(kept.id)
        );
        let kept_files: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM files WHERE folder_id = ?1",
                [kept.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(kept_files, 0);

        let _ = fs::remove_dir_all(data.parent().unwrap());
    }

