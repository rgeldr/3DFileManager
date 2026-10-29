    #[test]
    fn save_external_programs_keeps_order_and_leaves_settings_unchanged_on_reject() {
        let dir = std::env::temp_dir().join(format!("filelib-save-programs-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let db = db::open(&dir).unwrap();
        save_external_programs(
            &db,
            vec![
                crate::external_programs::ExternalProgram {
                    id: " bambu ".into(),
                    name: " Bambu Studio ".into(),
                    path: r"  C:\Program Files\Bambu Studio\bambu-studio.exe  ".into(),
                },
                crate::external_programs::ExternalProgram {
                    id: "orca".into(),
                    name: "OrcaSlicer".into(),
                    path: r"C:\Program Files\OrcaSlicer\orca-slicer.exe".into(),
                },
            ],
        )
        .unwrap();
        let loaded = db.settings().external_programs;
        assert_eq!(loaded[0].id, "bambu");
        assert_eq!(loaded[0].name, "Bambu Studio");
        assert_eq!(loaded[1].id, "orca");
        let rejected = save_external_programs(
            &db,
            vec![crate::external_programs::ExternalProgram {
                id: "bad".into(),
                name: "Bad".into(),
                path: "prusa-slicer.exe".into(),
            }],
        );
        assert!(rejected.unwrap_err().contains(".exe"));
        assert_eq!(db.settings().external_programs, loaded);
        let _ = fs::remove_dir_all(&dir);
    }

    #[cfg(unix)]
    #[test]
    fn launch_catalog_file_uses_the_saved_executable_and_the_library_file() {
        let dir = std::env::temp_dir().join(format!("filelib-open-prog-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let db = db::open(&dir).unwrap();
        let root = dir.join("library");
        fs::create_dir_all(root.join("Models")).unwrap();
        let stored = "Models/My Cube ベンチ.stl";
        fs::write(root.join("Models").join("My Cube ベンチ.stl"), b"solid").unwrap();
        let exe = dir.join("orca slicer.exe");
        let other = dir.join("other.exe");
        let log = dir.join("launched.txt");
        fs::write(
            &exe,
            format!("#!/bin/sh\nprintf '%s\\n' \"$0\" \"$@\" > '{}'\n", log.display()),
        )
        .unwrap();
        fs::write(&other, b"#!/bin/sh\n").unwrap();
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&exe, fs::Permissions::from_mode(0o755)).unwrap();
        let mut settings = Settings::default();
        settings.library_root = Some(root.to_string_lossy().to_string());
        settings.external_programs = vec![
            crate::external_programs::ExternalProgram {
                id: "orca".into(),
                name: "OrcaSlicer".into(),
                path: exe.to_string_lossy().to_string(),
            },
            crate::external_programs::ExternalProgram {
                id: "other".into(),
                name: "Other".into(),
                path: other.to_string_lossy().to_string(),
            },
        ];
        db.save_settings(&settings).unwrap();
        let id = db
            .insert_file("My Cube ベンチ.stl", stored, "stl", 5, "sha-cube", 1, None, None)
            .unwrap();

        launch_catalog_file(&db, id, "orca").unwrap();
        let text = wait_for_launch_log(&log);
        let mut lines = text.lines();
        let argv0 = lines.next().unwrap();
        assert!(argv0.contains("orca slicer.exe"));
        assert!(!argv0.contains("other.exe"));
        let argument = lines.next().unwrap();
        assert!(argument.contains("My Cube ベンチ.stl"));
        assert!(!argument.contains("other.exe"));
        assert!(lines.next().is_none());

        assert!(launch_catalog_file(&db, id, "missing")
            .unwrap_err()
            .contains("no longer"));
        settings.external_programs[0].path = dir.join("gone.exe").to_string_lossy().to_string();
        db.save_settings(&settings).unwrap();
        let missing = launch_catalog_file(&db, id, "orca").unwrap_err();
        assert!(missing.contains("Can't find OrcaSlicer"));
        assert!(missing.contains("gone.exe"));

        let outside = db
            .insert_file("secret.stl", "../secret.stl", "stl", 6, "sha-secret", 1, None, None)
            .unwrap();
        settings.external_programs[0].path = exe.to_string_lossy().to_string();
        db.save_settings(&settings).unwrap();
        assert!(launch_catalog_file(&db, outside, "orca").is_err());
        let _ = fs::remove_dir_all(&dir);
    }

    #[cfg(unix)]
    fn wait_for_launch_log(path: &std::path::Path) -> String {
        for _ in 0..50 {
            if let Ok(text) = fs::read_to_string(path) {
                if !text.is_empty() {
                    return text;
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        panic!("timed out waiting for {}", path.display());
    }

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

    #[test]
    fn drag_source_for_id_uses_the_catalog_name_and_stays_inside_the_library() {
        let dir = std::env::temp_dir().join(format!("filelib-drag-one-{}", std::process::id()));
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
        let source = drag_source_for_id(&db, id).unwrap();
        assert!(source.path.ends_with("Hero.stl"));
        assert!(!source.path.contains("secret"));
        assert_eq!(source.file_name, "Hero.STL");
        assert_eq!(source.ext, "stl");
        assert!(drag_source_for_id(&db, outside).unwrap_err().contains("outside"));
        fs::remove_file(root.join("Hero.stl")).unwrap();
        assert!(drag_source_for_id(&db, id).unwrap_err().contains("missing"));
        assert!(drag_source_for_id(&db, 999_999).unwrap_err().contains("not found"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn catalog_text_preview_reads_notes_and_skips_other_extensions() {
        let dir = std::env::temp_dir().join(format!("filelib-catalog-text-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let db = db::open(&dir).unwrap();
        let root = dir.join("library");
        fs::create_dir_all(&root).unwrap();
        let mut settings = Settings::default();
        settings.library_root = Some(root.to_string_lossy().to_string());
        db.save_settings(&settings).unwrap();
        fs::write(root.join("notes.md"), b"# Title\n").unwrap();
        fs::write(root.join("widget.scad"), b"cube(1);").unwrap();
        fs::write(root.join("readme.TXT"), b"Hello\0there").unwrap();
        fs::write(root.join("part.step"), b"ISO-10303-21;").unwrap();
        fs::write(dir.join("secret.txt"), b"secret").unwrap();
        let md = db
            .insert_file("notes.md", "notes.md", "md", 8, "sha-md", 1, None, None)
            .unwrap();
        let scad = db
            .insert_file("widget.scad", "widget.scad", "scad", 8, "sha-scad", 1, None, None)
            .unwrap();
        let txt = db
            .insert_file("readme.TXT", "readme.TXT", "txt", 11, "sha-txt", 1, None, None)
            .unwrap();
        let step = db
            .insert_file("part.step", "part.step", "step", 13, "sha-step", 1, None, None)
            .unwrap();
        let outside = db
            .insert_file("secret.txt", "../secret.txt", "txt", 6, "sha-secret", 1, None, None)
            .unwrap();
        let missing = db
            .insert_file("gone.txt", "gone.txt", "txt", 1, "sha-gone", 1, None, None)
            .unwrap();
        assert_eq!(catalog_text_preview(&db, md).unwrap(), "# Title\n");
        assert_eq!(catalog_text_preview(&db, scad).unwrap(), "cube(1);");
        assert_eq!(catalog_text_preview(&db, txt).unwrap(), "Hellothere");
        assert_eq!(catalog_text_preview(&db, step).unwrap(), "");
        assert!(catalog_text_preview(&db, outside).unwrap_err().contains("outside"));
        assert!(catalog_text_preview(&db, missing).unwrap_err().contains("missing"));
        assert!(catalog_text_preview(&db, 999_999).unwrap_err().contains("not found"));
        let _ = fs::remove_dir_all(&dir);
    }

    struct EnvVarGuard {
        key: &'static str,
        prev: Option<std::ffi::OsString>,
    }

    impl EnvVarGuard {
        fn set(key: &'static str, value: &std::path::Path) -> Self {
            let prev = std::env::var_os(key);
            std::env::set_var(key, value);
            Self { key, prev }
        }
    }

    impl Drop for EnvVarGuard {
        fn drop(&mut self) {
            if let Some(prev) = self.prev.take() {
                std::env::set_var(self.key, prev);
            } else {
                std::env::remove_var(self.key);
            }
        }
    }

    #[test]
    fn write_debug_log_appends_under_the_data_dir_and_keeps_the_tail() {
        let root = std::env::temp_dir().join(format!("filelib-debuglog-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        // data_dir() follows XDG_DATA_HOME, so the log can land in a temp folder.
        let _env = EnvVarGuard::set("XDG_DATA_HOME", &root);
        let log_dir = data_dir();
        assert_eq!(log_dir, root.join("3D File Library"));
        let path = PathBuf::from(write_debug_log("alpha".into()).unwrap());
        assert_eq!(path, log_dir.join("debug.log"));
        assert_eq!(fs::read_to_string(&path).unwrap(), "alpha\n");
        write_debug_log("beta".into()).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "alpha\nbeta\n");

        fs::write(&path, vec![b'C'; 1_048_576]).unwrap();
        write_debug_log("edge".into()).unwrap();
        let exact = fs::read(&path).unwrap();
        assert_eq!(exact.len(), 1_048_576 + "edge\n".len());
        assert_eq!(exact[0], b'C');
        assert!(exact.ends_with(b"edge\n"));

        let mut big = vec![b'B'; 1_048_577];
        big[0] = b'A';
        fs::write(&path, &big).unwrap();
        write_debug_log("tail".into()).unwrap();
        let trimmed = fs::read(&path).unwrap();
        assert_eq!(trimmed.len(), 512_000 + "tail\n".len());
        assert!(trimmed[..512_000].iter().all(|byte| *byte == b'B'));
        assert!(trimmed.ends_with(b"tail\n"));
        let _ = fs::remove_dir_all(&root);
    }
