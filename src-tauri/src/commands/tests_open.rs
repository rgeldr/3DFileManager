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
