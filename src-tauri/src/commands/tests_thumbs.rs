    fn thumb_status(db: &db::AppDb, id: i64) -> String {
        db.conn
            .query_row("SELECT thumb_status FROM files WHERE id = ?1", [id], |row| row.get(0))
            .unwrap()
    }

    #[test]
    fn rendered_thumb_for_an_unhashed_file_is_marked_unhashed() {
        let dir = std::env::temp_dir().join(format!("filelib-render-unhash-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let db = db::open(&dir).unwrap();
        let root = dir.join("library");
        fs::create_dir_all(&root).unwrap();
        let mut settings = Settings::default();
        settings.library_root = Some(root.to_string_lossy().to_string());
        db.save_settings(&settings).unwrap();
        let id = db
            .insert_file_with_thumb_status("x.stl", "x.stl", "stl", 1, "", 1, None, None, "none")
            .unwrap();
        let png = image::RgbaImage::from_pixel(2, 2, image::Rgba([1, 2, 3, 255]));
        let mut bytes = Vec::new();
        image::DynamicImage::ImageRgba8(png)
            .write_to(&mut std::io::Cursor::new(&mut bytes), image::ImageFormat::Png)
            .unwrap();
        store_rendered_thumb(&db, id, &bytes).unwrap();
        assert_eq!(thumb_status(&db, id), "unhashed");
        assert!(!db::thumb_path(&dir, "").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rendered_thumb_that_is_not_a_png_is_marked_unavailable() {
        let dir = std::env::temp_dir().join(format!("filelib-render-bad-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let db = db::open(&dir).unwrap();
        let root = dir.join("library");
        fs::create_dir_all(&root).unwrap();
        let mut settings = Settings::default();
        settings.library_root = Some(root.to_string_lossy().to_string());
        db.save_settings(&settings).unwrap();
        let id = db
            .insert_file("x.stl", "x.stl", "stl", 1, "sha-x", 1, None, None)
            .unwrap();
        store_rendered_thumb(&db, id, b"not a png").unwrap();
        assert_eq!(thumb_status(&db, id), "unavailable");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rendered_thumb_is_written_and_marked_ok() {
        let dir = std::env::temp_dir().join(format!("filelib-render-ok-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let db = db::open(&dir).unwrap();
        let root = dir.join("library");
        fs::create_dir_all(&root).unwrap();
        let mut settings = Settings::default();
        settings.library_root = Some(root.to_string_lossy().to_string());
        db.save_settings(&settings).unwrap();
        let id = db
            .insert_file("x.stl", "x.stl", "stl", 1, "sha-render", 1, None, None)
            .unwrap();
        let png = image::RgbaImage::from_pixel(2, 2, image::Rgba([4, 5, 6, 255]));
        let mut bytes = Vec::new();
        image::DynamicImage::ImageRgba8(png)
            .write_to(&mut std::io::Cursor::new(&mut bytes), image::ImageFormat::Png)
            .unwrap();
        store_rendered_thumb(&db, id, &bytes).unwrap();
        assert!(db::thumb_path(&dir, "sha-render").is_file());
        assert_eq!(thumb_status(&db, id), "ok");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn png_thumbnail_is_written_once_and_empty_sha_is_not() {
        let dir = std::env::temp_dir().join(format!("filelib-settle-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let db = db::open(&dir).unwrap();
        let root = dir.join("library");
        fs::create_dir_all(&root).unwrap();
        let mut settings = Settings::default();
        settings.library_root = Some(root.to_string_lossy().to_string());
        db.save_settings(&settings).unwrap();
        let png_path = root.join("pic.png");
        image::RgbImage::from_pixel(20, 10, image::Rgb([1, 2, 3]))
            .save(&png_path)
            .unwrap();
        let id = db
            .insert_file("pic.png", "pic.png", "png", 20, "sha-pic", 1, None, None)
            .unwrap();
        let candidate = db.claim_next_pending_thumb().unwrap().unwrap();
        let job = apply_thumb_action(&db, &candidate, classify_thumb(&root, &candidate)).unwrap();
        assert_eq!(job.kind, "done");
        assert_eq!(job.id, id);
        assert!(db::thumb_path(&dir, "sha-pic").is_file());
        let status: String = db
            .conn
            .query_row("SELECT thumb_status FROM files WHERE id = ?1", [id], |row| row.get(0))
            .unwrap();
        assert_eq!(status, "ok");
        assert!(db.claim_next_pending_thumb().unwrap().is_none());

        let empty = db
            .insert_file_with_thumb_status("empty.png", "empty.png", "png", 1, "", 1, None, None, "none")
            .unwrap();
        fs::write(root.join("empty.png"), b"not-a-real-png").unwrap();
        let candidate = db.claim_next_pending_thumb().unwrap().unwrap();
        assert_eq!(candidate.id, empty);
        let job = apply_thumb_action(&db, &candidate, classify_thumb(&root, &candidate)).unwrap();
        assert_eq!(job.kind, "skip");
        assert!(!db::thumb_path(&dir, "").exists());
        let status: String = db
            .conn
            .query_row("SELECT thumb_status FROM files WHERE id = ?1", [empty], |row| row.get(0))
            .unwrap();
        assert_eq!(status, "unhashed");
        assert!(command_should_log(50));
        assert!(!command_should_log(49));
        assert_eq!(command_log_line("list_files", 50), "command list_files 50ms");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn thumbnail_write_skips_a_deleted_row_and_removes_an_orphan() {
        let dir = std::env::temp_dir().join(format!("filelib-orphan-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let db = db::open(&dir).unwrap();
        let root = dir.join("library");
        fs::create_dir_all(&root).unwrap();
        let mut settings = Settings::default();
        settings.library_root = Some(root.to_string_lossy().to_string());
        db.save_settings(&settings).unwrap();
        let gone = db
            .insert_file("gone.png", "gone.png", "png", 4, "sha-gone", 1, None, None)
            .unwrap();
        db.conn.execute("DELETE FROM files WHERE id = ?1", [gone]).unwrap();
        assert!(!publish_thumb(&db, gone, "sha-gone", b"png", |_| {}).unwrap());
        assert!(!db::thumb_path(&dir, "sha-gone").exists());

        let id = db
            .insert_file("stay.png", "stay.png", "png", 4, "sha-stay", 1, None, None)
            .unwrap();
        let wrote = publish_thumb(&db, id, "sha-stay", b"png", |db| {
            db.conn.execute("DELETE FROM files WHERE id = ?1", [id]).unwrap();
        })
        .unwrap();
        assert!(!wrote);
        assert!(!db::thumb_path(&dir, "sha-stay").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    fn thumb_candidate(id: i64, rel: &str, ext: &str, sha: &str) -> db::ThumbCandidate {
        db::ThumbCandidate {
            id,
            stored_relpath: rel.into(),
            ext: ext.into(),
            size_bytes: 4,
            sha256: sha.into(),
        }
    }

    #[test]
    fn row_exists_follows_the_files_table() {
        let dir = std::env::temp_dir().join(format!("filelib-row-exists-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let db = db::open(&dir).unwrap();
        let id = db
            .insert_file("stay.stl", "stay.stl", "stl", 1, "sha-stay", 1, None, None)
            .unwrap();
        assert!(row_exists(&db, id).unwrap());
        db.conn.execute("DELETE FROM files WHERE id = ?1", [id]).unwrap();
        assert!(!row_exists(&db, id).unwrap());
        assert!(!row_exists(&db, 0).unwrap());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn thumb_action_sets_status_for_each_variant() {
        let dir = std::env::temp_dir().join(format!("filelib-thumb-action-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let db = db::open(&dir).unwrap();
        let root = dir.join("library");
        fs::create_dir_all(&root).unwrap();
        let mut settings = Settings::default();
        settings.library_root = Some(root.to_string_lossy().to_string());
        db.save_settings(&settings).unwrap();
        let id = db
            .insert_file("x.stl", "x.stl", "stl", 4, "sha-act", 1, None, None)
            .unwrap();
        let candidate = thumb_candidate(id, "x.stl", "stl", "sha-act");

        let unavailable = apply_thumb_action(&db, &candidate, ThumbAction::Unavailable).unwrap();
        assert_eq!(unavailable.kind, "skip");
        assert_eq!(unavailable.id, id);
        assert!(unavailable.absolute_path.ends_with("x.stl"));
        assert_eq!(thumb_status(&db, id), "unavailable");

        let unhashed = apply_thumb_action(&db, &candidate, ThumbAction::Unhashed).unwrap();
        assert_eq!(unhashed.kind, "skip");
        assert_eq!(thumb_status(&db, id), "unhashed");

        let retry = apply_thumb_action(&db, &candidate, ThumbAction::Retry).unwrap();
        assert_eq!(retry.kind, "skip");
        assert_eq!(thumb_status(&db, id), "none");

        let render = apply_thumb_action(&db, &candidate, ThumbAction::Render).unwrap();
        assert_eq!(render.kind, "render");
        assert_eq!(render.ext, "stl");
        assert_eq!(render.size_bytes, 4);

        let png = b"png-bytes".to_vec();
        match ThumbAction::Ok(png.clone()) {
            ThumbAction::Ok(bytes) => assert_eq!(bytes, png),
            ThumbAction::Unavailable | ThumbAction::Retry | ThumbAction::Render | ThumbAction::Unhashed => {
                panic!("expected thumbnail bytes");
            }
        }
        let done = apply_thumb_action(&db, &candidate, ThumbAction::Ok(png.clone())).unwrap();
        assert_eq!(done.kind, "done");
        assert_eq!(fs::read(db::thumb_path(&dir, "sha-act")).unwrap(), png);
        assert_eq!(thumb_status(&db, id), "ok");

        let gone = db
            .insert_file("gone.stl", "gone.stl", "stl", 4, "sha-gone-act", 1, None, None)
            .unwrap();
        db.conn.execute("DELETE FROM files WHERE id = ?1", [gone]).unwrap();
        let skipped = apply_thumb_action(
            &db,
            &thumb_candidate(gone, "gone.stl", "stl", "sha-gone-act"),
            ThumbAction::Ok(b"orphan".to_vec()),
        )
        .unwrap();
        assert_eq!(skipped.kind, "skip");
        assert!(!db::thumb_path(&dir, "sha-gone-act").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn requeue_image_thumbs_once_resets_unavailable_images_a_single_time() {
        let dir = std::env::temp_dir().join(format!("filelib-requeue-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let db = db::open(&dir).unwrap();
        let png = db
            .insert_file_with_thumb_status("a.png", "a.png", "png", 1, "sha-a", 1, None, None, "unavailable")
            .unwrap();
        let jpg = db
            .insert_file_with_thumb_status("b.jpg", "b.jpg", "jpg", 1, "sha-b", 1, None, None, "unavailable")
            .unwrap();
        let jpeg = db
            .insert_file_with_thumb_status("c.jpeg", "c.jpeg", "jpeg", 1, "sha-c", 1, None, None, "unavailable")
            .unwrap();
        let stl = db
            .insert_file_with_thumb_status("d.stl", "d.stl", "stl", 1, "sha-d", 1, None, None, "unavailable")
            .unwrap();
        let ready = db
            .insert_file_with_thumb_status("e.png", "e.png", "png", 1, "sha-e", 1, None, None, "ok")
            .unwrap();
        assert_eq!(db.settings().thumb_retry, 0);
        requeue_image_thumbs_once(&db);
        assert_eq!(thumb_status(&db, png), "none");
        assert_eq!(thumb_status(&db, jpg), "none");
        assert_eq!(thumb_status(&db, jpeg), "none");
        assert_eq!(thumb_status(&db, stl), "unavailable");
        assert_eq!(thumb_status(&db, ready), "ok");
        assert_eq!(db.settings().thumb_retry, 1);
        db.set_thumb_status(png, "unavailable").unwrap();
        requeue_image_thumbs_once(&db);
        assert_eq!(thumb_status(&db, png), "unavailable");
        assert_eq!(db.settings().thumb_retry, 1);

        let held = std::env::temp_dir().join(format!("filelib-requeue-held-{}", std::process::id()));
        let _ = fs::remove_dir_all(&held);
        let held_db = db::open(&held).unwrap();
        let held_png = held_db
            .insert_file_with_thumb_status("held.png", "held.png", "png", 1, "sha-held", 1, None, None, "unavailable")
            .unwrap();
        let mut settings = held_db.settings();
        settings.thumb_retry = 2;
        held_db.save_settings(&settings).unwrap();
        requeue_image_thumbs_once(&held_db);
        assert_eq!(thumb_status(&held_db, held_png), "unavailable");
        assert_eq!(held_db.settings().thumb_retry, 2);
        let _ = fs::remove_dir_all(&dir);
        let _ = fs::remove_dir_all(&held);
    }
