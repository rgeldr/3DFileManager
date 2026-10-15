    #[test]
    fn import_organize_search_rescan_and_recycle() {
        let (data, library, incoming) = scratch();
        let mut db = open(&data).unwrap();
        assert!(db.settings().library_root.is_none());
        assert_eq!(db.settings().theme, "dark");
        let boot = db.set_library_root(&library).unwrap();
        assert!(db.set_library_root(&library).is_err());
        let names: Vec<_> = boot.folders.iter().map(|f| f.name.as_str()).collect();
        assert_eq!(names, ["FDM Prints", "Models", "Wargaming Terrain"]);
        for folder in &boot.folders {
            assert!(library.join(&folder.relpath).is_dir());
        }
        let models = boot.folders.iter().find(|f| f.name == "Models").unwrap().id;
        let terrain = boot
            .folders
            .iter()
            .find(|f| f.name == "Wargaming Terrain")
            .unwrap()
            .id;

        let first = incoming.join("Throne_of_Baal.stl");
        let second = incoming.join("copy-slot");
        fs::create_dir_all(&second).unwrap();
        let second = second.join("Throne_of_Baal.stl");
        fs::write(&first, b"solid a\nendsolid a\n").unwrap();
        fs::write(&second, b"solid b\nendsolid b\n").unwrap();

        let imported = import_paths(
            &mut db,
            &[first.to_string_lossy().to_string(), second.to_string_lossy().to_string()],
            Some(models),
            &NO_CANCEL,
            |_| {},
        )
        .unwrap();
        let summary = finish_import(&mut db, imported);
        assert_eq!(summary.imported_count, 2);
        assert!(summary.failed.is_empty(), "{:?}", summary.failed);
        assert_eq!(summary.recycle_paths.len(), 2);
        let rows = db
            .list_files(FolderFilter::Id(models), "", "", "", "name")
            .unwrap();
        let stored: Vec<_> = rows.iter().map(|r| r.stored_relpath.clone()).collect();
        assert!(stored.iter().any(|p| p.ends_with("Throne_of_Baal.stl")));
        assert!(stored.iter().any(|p| p.ends_with("Throne_of_Baal (2).stl")));
        assert!(rows.iter().all(|r| r.sort_name == "Throne of Baal"));

        let again = import_paths(
            &mut db,
            &[first.to_string_lossy().to_string()],
            Some(models),
            &NO_CANCEL,
            |_| {},
        )
        .unwrap();
        assert_eq!(again.imported_count, 1);
        drain_unhashed(&mut db).unwrap();
        let after_dup = db
            .list_files(FolderFilter::Id(models), "", "", "", "name")
            .unwrap();
        assert_eq!(after_dup.len(), 2);
        assert_eq!(
            again.recycle_paths,
            vec![first.to_string_lossy().to_string()],
            "a reimported original is recycled once its copy is in the library"
        );

        let id = rows[0].id;
        db.update_file(id, "Throne of Baal", "Jason", "keep these notes", Some(models))
            .unwrap();
        db.set_tags(id, &["terrain".into(), "baal".into()]).unwrap();
        let found = db
            .list_files(FolderFilter::All, "thro", "", "", "name")
            .unwrap();
        assert!(found.iter().any(|r| r.id == id));
        let tagged = db
            .list_files(FolderFilter::All, "", "", "baal", "name")
            .unwrap();
        assert_eq!(tagged.len(), 1);

        let zip_path = incoming.join("Citadel.zip");
        {
            let file = File::create(&zip_path).unwrap();
            let mut zip = ZipWriter::new(file);
            zip.start_file("walls/Gate.stl", SimpleFileOptions::default()).unwrap();
            zip.write_all(b"solid gate\nendsolid gate\n").unwrap();
            zip.finish().unwrap();
        }
        let seven = incoming.join("Outpost.7z");
        let seven_src = incoming.join("seven-src");
        fs::create_dir_all(seven_src.join("floors")).unwrap();
        fs::write(seven_src.join("floors").join("Tile.obj"), b"o tile\n").unwrap();
        sevenz_rust::compress_to_path(&seven_src, &seven).unwrap();

        let imported = import_paths(
            &mut db,
            &[
                zip_path.to_string_lossy().to_string(),
                seven.to_string_lossy().to_string(),
            ],
            None,
            &NO_CANCEL,
            |_| {},
        )
        .unwrap();
        let archived = finish_import(&mut db, imported);
        assert!(archived.failed.is_empty(), "{:?}", archived.failed);
        assert_eq!(archived.imported_count, 2);
        assert!(library.join("Citadel").join("walls").join("Gate.stl").is_file());
        assert!(library.join("Outpost").join("floors").join("Tile.obj").is_file());
        assert!(archived.recycle_paths.iter().any(|p| p.ends_with("Citadel.zip")));

        db.move_files(&[id], Some(terrain)).unwrap();
        let moved = db.file_location(id).unwrap();
        assert_eq!(moved.folder_id, Some(terrain));
        assert!(library.join(&moved.stored_relpath).is_file());

        let loose = library.join("FoundOnDisk");
        fs::create_dir_all(&loose).unwrap();
        let relocated_to = loose.join("Throne_of_Baal.stl");
        fs::rename(library.join(&moved.stored_relpath), &relocated_to).unwrap();
        let scan = rescan(&db, |_| {}).unwrap();
        assert!(scan.relocated >= 1);
        assert!(scan.added_folders >= 1);
        let after = db.file_location(id).unwrap();
        assert!(after
            .stored_relpath
            .replace('\\', "/")
            .ends_with("FoundOnDisk/Throne_of_Baal.stl"));
        let notes = db
            .list_files(FolderFilter::All, "thro", "Jason", "", "name")
            .unwrap();
        assert!(notes.iter().any(|r| r.id == id && r.notes == "keep these notes"));

        let empty = db.create_folder(Some(models), "Empty Bin", 0).unwrap();
        db.delete_folder(empty.id).unwrap();
        assert!(db.delete_folder(models).is_err());

        let doomed = db.file_location(id).unwrap();
        let items = db.trash_items(&[id]).unwrap();
        let db = Mutex::new(db);
        recycle_and_drop_files(&db, &items, &AtomicBool::new(false), |_| {}, |path| {
            trash::delete(path).map_err(|err| err.to_string())
        })
        .unwrap();
        assert!(!library.join(&doomed.stored_relpath).exists());
        let failed = recycle_paths(&[first.to_string_lossy().to_string()]).unwrap();
        assert!(failed.is_empty(), "{failed:?}");
        assert!(!first.exists());
        let _ = fs::remove_dir_all(data.parent().unwrap());
    }

    #[test]
    fn folder_import_emits_per_file_progress() {
        let (data, library, incoming) = scratch();
        let mut db = open(&data).unwrap();
        let boot = db.set_library_root(&library).unwrap();
        let models = boot.folders.iter().find(|f| f.name == "Models").unwrap().id;

        let pack = incoming.join("pack");
        fs::create_dir_all(pack.join("nested")).unwrap();
        fs::write(pack.join("a.stl"), b"solid a\nendsolid a\n").unwrap();
        fs::write(pack.join("nested").join("b.stl"), b"solid b\nendsolid b\n").unwrap();
        fs::write(pack.join("notes.dat"), b"skip").unwrap();

        let mut events: Vec<(u32, u32)> = Vec::new();
        let imported = import_paths(
            &mut db,
            &[pack.to_string_lossy().to_string()],
            Some(models),
            &NO_CANCEL,
            |p| events.push((p.current, p.total)),
        )
        .unwrap();
        let summary = finish_import(&mut db, imported);
        assert_eq!(summary.imported_count, 2);
        assert_eq!(summary.unsupported_count, 1);

        let totals: Vec<u32> = events.iter().map(|(_, t)| *t).collect();
        assert!(
            totals.iter().any(|t| *t == 3),
            "expected total 3 files in folder, got totals {totals:?}"
        );
        let max_current = events.iter().map(|(c, _)| *c).max().unwrap_or(0);
        assert_eq!(max_current, 3, "progress should advance once per file: {events:?}");

        let _ = fs::remove_dir_all(data.parent().unwrap());
    }


    #[test]
    fn cancel_stops_after_current_file() {
        let (data, library, incoming) = scratch();
        let mut db = open(&data).unwrap();
        let boot = db.set_library_root(&library).unwrap();
        let models = boot.folders.iter().find(|f| f.name == "Models").unwrap().id;
        let pack = incoming.join("pack");
        fs::create_dir_all(&pack).unwrap();
        fs::write(pack.join("a.stl"), b"solid a\nendsolid a\n").unwrap();
        fs::write(pack.join("b.stl"), b"solid b\nendsolid b\n").unwrap();
        let cancel = AtomicBool::new(false);
        let summary = import_paths(
            &mut db,
            &[pack.to_string_lossy().to_string()],
            Some(models),
            &cancel,
            |p| {
                if p.current >= 1 {
                    cancel.store(true, Ordering::SeqCst);
                }
            },
        )
        .unwrap();
        let _ = drain_unhashed(&mut db).unwrap();
        assert!(summary.cancelled);
        assert_eq!(summary.imported_count, 1);
        let rows = db
            .list_files(FolderFilter::Id(models), "", "", "", "name")
            .unwrap();
        assert_eq!(rows.len(), 1);
        let _ = fs::remove_dir_all(data.parent().unwrap());
    }

