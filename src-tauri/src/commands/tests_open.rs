    #[test]
    fn contained_library_dir_stays_inside_the_root() {
        let dir = std::env::temp_dir().join(format!("filelib-open-dir-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let root = dir.join("library");
        fs::create_dir_all(root.join("Models")).unwrap();
        fs::write(root.join("Models").join("guide.pdf"), b"%PDF-1.4\n").unwrap();
        fs::create_dir_all(dir.join("outside")).unwrap();

        let opened_root = contained_library_dir(&root, "").unwrap();
        assert!(opened_root.is_dir());
        let canonical_root = root.canonicalize().unwrap();
        assert_eq!(opened_root, canonical_root);

        let models = contained_library_dir(&root, "Models").unwrap();
        assert!(models.is_dir());
        assert!(models.ends_with("Models"));

        assert!(contained_library_dir(&root, "../outside").unwrap_err().contains("outside"));
        assert!(contained_library_dir(&root, "Models/../../outside").unwrap_err().contains("outside"));
        let abs_outside = dir.join("outside").canonicalize().unwrap();
        assert!(contained_library_dir(&root, &abs_outside.to_string_lossy()).unwrap_err().contains("outside"));
        assert!(contained_library_dir(&root, "Models/missing").unwrap_err().contains("missing"));
        assert!(contained_library_dir(&root, "Models/guide.pdf").is_err());
        assert!(contained_library_dir(&root, "Models\0evil").is_err());

        #[cfg(unix)]
        {
            let secret = dir.join("secret_dir");
            fs::create_dir_all(&secret).unwrap();
            std::os::unix::fs::symlink(&secret, root.join("Models").join("linkdir")).unwrap();
            assert!(contained_library_dir(&root, "Models/linkdir").is_err());
        }

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn catalog_file_path_rejects_a_row_outside_the_library() {
        let dir = std::env::temp_dir().join(format!("filelib-catalog-path-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let db = db::open(&dir).unwrap();
        let root = dir.join("library");
        fs::create_dir_all(&root).unwrap();
        let mut settings = Settings::default();
        settings.library_root = Some(root.to_string_lossy().to_string());
        db.save_settings(&settings).unwrap();
        fs::write(root.join("keep.stl"), b"keep").unwrap();
        let keep = db
            .insert_file("keep.stl", "keep.stl", "stl", 4, "sha-keep", 1, None, None)
            .unwrap();
        let outside = db
            .insert_file("secret.stl", "../secret.stl", "stl", 6, "sha-secret", 1, None, None)
            .unwrap();
        let path = catalog_file_path(&db, keep).unwrap();
        assert!(path.is_file());
        assert!(path.ends_with("keep.stl"));
        assert!(catalog_file_path(&db, outside).is_err());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn contained_library_file_stays_inside_the_root() {
        let dir = std::env::temp_dir().join(format!("filelib-open-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let root = dir.join("library");
        fs::create_dir_all(root.join("Models")).unwrap();
        fs::write(root.join("Models").join("guide.pdf"), b"%PDF-1.4\n").unwrap();
        fs::write(dir.join("secret.pdf"), b"nope").unwrap();

        let opened = contained_library_file(&root, "Models/guide.pdf").unwrap();
        assert!(opened.is_file());
        assert!(opened.ends_with("guide.pdf"));
        let secret = dir.join("secret.pdf");
        assert!(contained_library_file(&root, "../secret.pdf").is_err());
        assert!(contained_library_file(&root, "Models/../../secret.pdf").is_err());
        assert!(contained_library_file(&root, &secret.to_string_lossy()).is_err());
        assert!(contained_library_file(&root, "").is_err());
        assert!(contained_library_file(&root, "Models").is_err());
        assert!(contained_library_file(&root, "Models/missing.pdf").is_err());
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(&secret, root.join("Models").join("link.pdf")).unwrap();
            assert!(contained_library_file(&root, "Models/link.pdf").is_err());
        }

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn drag_sources_come_from_catalog_ids() {
        let dir = std::env::temp_dir().join(format!("filelib-drag-id-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let db = db::open(&dir).unwrap();
        let root = dir.join("library");
        fs::create_dir_all(&root).unwrap();
        let mut settings = Settings::default();
        settings.library_root = Some(root.to_string_lossy().to_string());
        db.save_settings(&settings).unwrap();
        fs::write(root.join("Hero.stl"), b"solid").unwrap();
        fs::write(dir.join("secret.stl"), b"secret").unwrap();
        let id = db
            .insert_file("Hero.STL", "Hero.stl", "stl", 5, "sha-hero", 1, None, None)
            .unwrap();
        let outside = db
            .insert_file("secret.stl", "../secret.stl", "stl", 6, "sha-secret", 1, None, None)
            .unwrap();
        let (sources, skipped) = drag_sources_for_ids(&db, &[id, outside]);
        assert_eq!(sources.len(), 1);
        assert!(sources[0].path.ends_with("Hero.stl"));
        assert_eq!(sources[0].file_name, "Hero.STL");
        assert_eq!(sources[0].ext, "stl");
        assert!(!sources[0].path.contains("secret"));
        assert_eq!(skipped.len(), 1);
        assert!(dir.join("secret.stl").is_file());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn text_preview_keeps_printable_text_and_stops_at_four_kilobytes() {
        let cleaned = clean_text_preview(b"Hello\tthere\n\0\x01caf\xff\xfe\n\xEF\xBB\xBFHi");
        assert_eq!(cleaned, "Hello\tthere\ncaf\nHi");
        let mut long = vec![b'A'; TEXT_PREVIEW_BYTES];
        long.push(b'Z');
        let preview = clean_text_preview(&long);
        assert_eq!(preview.len(), TEXT_PREVIEW_BYTES);
        assert!(!preview.contains('Z'));

        let dir = std::env::temp_dir().join(format!("filelib-txt-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("notes.txt"), &long).unwrap();
        let from_file = read_text_preview(&dir.join("notes.txt")).unwrap();
        assert_eq!(from_file.len(), TEXT_PREVIEW_BYTES);
        assert!(!from_file.contains('Z'));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn text_preview_reads_markdown_and_scad_not_step() {
        let dir = std::env::temp_dir().join(format!("filelib-text-ext-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("notes.md"), b"# Title").unwrap();
        fs::write(dir.join("widget.scad"), b"module x() {}").unwrap();
        assert_eq!(read_text_preview(&dir.join("notes.md")).unwrap(), "# Title");
        assert_eq!(read_text_preview(&dir.join("widget.scad")).unwrap(), "module x() {}");
        let ext = names::extension_of("part.step");
        assert_eq!(ext, "step");
        assert!(!matches!(ext.as_str(), "txt" | "md" | "scad"));
        let _ = fs::remove_dir_all(&dir);
    }
