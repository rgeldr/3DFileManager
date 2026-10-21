    fn tiny_limits(max_entries: u64, max_bytes: u64) -> ExtractLimits {
        ExtractLimits {
            max_entries,
            max_bytes,
        }
    }

    #[test]
    fn archive_entry_paths_stay_inside_the_import_folder() {
        let dest = std::env::temp_dir().join(format!(
            "3dfl-entry-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis()
        ));
        fs::create_dir_all(&dest).unwrap();
        let inside = entry_dest(&dest, "walls/Gate.stl").unwrap().unwrap();
        assert_eq!(inside, dest.join("walls").join("Gate.stl"));
        assert_eq!(
            entry_dest(&dest, "models\\Tile.stl").unwrap().unwrap(),
            dest.join("models").join("Tile.stl")
        );
        assert!(entry_dest(&dest, ".").unwrap().is_none());
        for bad in [
            "../outside.stl",
            "walls/../../outside.stl",
            "/etc/passwd",
            "C:/Windows/note.stl",
            "\\\\server\\share\\note.stl",
            "ok/../../etc/passwd",
        ] {
            assert!(entry_dest(&dest, bad).is_err(), "{bad}");
        }
        let _ = fs::remove_dir_all(&dest);
    }

    #[test]
    fn zip_extract_rejects_escape_and_stops_at_the_caps() {
        let (data, _library, incoming) = scratch();
        let dest = data.join("out");
        fs::create_dir_all(&dest).unwrap();

        let good = incoming.join("Citadel.zip");
        {
            let file = File::create(&good).unwrap();
            let mut zip = ZipWriter::new(file);
            zip.start_file("walls/Gate.stl", SimpleFileOptions::default())
                .unwrap();
            zip.write_all(b"solid gate\nendsolid gate\n").unwrap();
            zip.finish().unwrap();
        }
        extract_any(&good, &dest).unwrap();
        assert!(dest.join("walls").join("Gate.stl").is_file());

        let escape = incoming.join("escape.zip");
        {
            let file = File::create(&escape).unwrap();
            let mut zip = ZipWriter::new(file);
            zip.start_file("../outside.stl", SimpleFileOptions::default())
                .unwrap();
            zip.write_all(b"solid x\nendsolid x\n").unwrap();
            zip.finish().unwrap();
        }
        let err = extract_any(&escape, &dest).unwrap_err();
        assert!(err.contains("leave the import folder"), "{err}");
        assert!(!incoming.join("outside.stl").exists());
        assert!(!data.join("outside.stl").exists());

        let heavy = incoming.join("heavy.zip");
        {
            let file = File::create(&heavy).unwrap();
            let mut zip = ZipWriter::new(file);
            zip.start_file("a.stl", SimpleFileOptions::default()).unwrap();
            zip.write_all(&[b'a'; 40]).unwrap();
            zip.start_file("b.stl", SimpleFileOptions::default()).unwrap();
            zip.write_all(&[b'b'; 40]).unwrap();
            zip.finish().unwrap();
        }
        let capped = dest.join("capped");
        fs::create_dir_all(&capped).unwrap();
        let err = extract_any_limited(&heavy, &capped, tiny_limits(100, 50)).unwrap_err();
        assert!(err.contains("too large"), "{err}");

        let many = incoming.join("many.zip");
        {
            let file = File::create(&many).unwrap();
            let mut zip = ZipWriter::new(file);
            zip.start_file("a.stl", SimpleFileOptions::default()).unwrap();
            zip.write_all(b"a").unwrap();
            zip.start_file("b.stl", SimpleFileOptions::default()).unwrap();
            zip.write_all(b"b").unwrap();
            zip.finish().unwrap();
        }
        let counted = dest.join("counted");
        fs::create_dir_all(&counted).unwrap();
        let err = extract_any_limited(&many, &counted, tiny_limits(1, 10_000)).unwrap_err();
        assert!(err.contains("too many"), "{err}");

        let _ = fs::remove_dir_all(data.parent().unwrap());
    }

    #[test]
    fn sevenz_extract_rejects_escape_and_keeps_a_normal_pack() {
        let (data, _library, incoming) = scratch();
        let dest = data.join("out");
        fs::create_dir_all(&dest).unwrap();

        let seven = incoming.join("Outpost.7z");
        let seven_src = incoming.join("seven-src");
        fs::create_dir_all(seven_src.join("floors")).unwrap();
        fs::write(seven_src.join("floors").join("Tile.obj"), b"o tile\n").unwrap();
        sevenz_rust::compress_to_path(&seven_src, &seven).unwrap();
        extract_any(&seven, &dest).unwrap();
        assert_eq!(
            fs::read(dest.join("floors").join("Tile.obj")).unwrap(),
            b"o tile\n"
        );

        let escape = incoming.join("escape.7z");
        {
            let mut writer = sevenz_rust::SevenZWriter::create(&escape).unwrap();
            let mut entry = sevenz_rust::SevenZArchiveEntry::new();
            entry.name = "../outside.stl".into();
            writer
                .push_archive_entry(entry, Some(&b"solid x\n"[..]))
                .unwrap();
            writer.finish().unwrap();
        }
        let escaped = dest.join("escaped");
        fs::create_dir_all(&escaped).unwrap();
        let err = extract_any(&escape, &escaped).unwrap_err();
        assert!(err.contains("leave the import folder"), "{err}");
        assert!(!incoming.join("outside.stl").exists());
        assert!(!data.join("outside.stl").exists());
        assert!(!escaped.join("outside.stl").exists());

        let _ = fs::remove_dir_all(data.parent().unwrap());
    }

    #[test]
    fn bad_archive_import_reports_the_failure_and_removes_the_temp_dir() {
        let (data, library, incoming) = scratch();
        let mut db = open(&data).unwrap();
        db.set_library_root(&library).unwrap();
        let zip_path = incoming.join("bad.zip");
        {
            let file = File::create(&zip_path).unwrap();
            let mut zip = ZipWriter::new(file);
            zip.start_file("../outside.stl", SimpleFileOptions::default())
                .unwrap();
            zip.write_all(b"solid x\nendsolid x\n").unwrap();
            zip.finish().unwrap();
        }
        let summary = import_paths(
            &mut db,
            &[zip_path.to_string_lossy().to_string()],
            None,
            &NO_CANCEL,
            |_| {},
        )
        .unwrap();
        assert_eq!(summary.imported_count, 0);
        assert!(
            summary.failed.iter().any(|line| line.contains("leave the import folder")),
            "{:?}",
            summary.failed
        );
        let tmp = data.join("tmp-import");
        if tmp.exists() {
            assert!(fs::read_dir(&tmp).unwrap().next().is_none());
        }
        assert!(!incoming.join("outside.stl").exists());
        let _ = fs::remove_dir_all(data.parent().unwrap());
    }
