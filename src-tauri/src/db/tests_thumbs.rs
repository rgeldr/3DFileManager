    #[test]
    fn release_rendering_thumb_only_clears_rendering_rows() {
        let dir = std::env::temp_dir().join(format!("filelib-release-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let db = open(&dir).unwrap();
        let root = dir.join("library");
        std::fs::create_dir_all(&root).unwrap();
        let mut settings = Settings::default();
        settings.library_root = Some(root.to_string_lossy().to_string());
        db.save_settings(&settings).unwrap();
        let rendering = db
            .insert_file_with_thumb_status("a.stl", "a.stl", "stl", 1, "sha-a", 1, None, None, "rendering")
            .unwrap();
        let ready = db
            .insert_file_with_thumb_status("b.stl", "b.stl", "stl", 1, "sha-b", 1, None, None, "ok")
            .unwrap();
        db.release_rendering_thumb(rendering).unwrap();
        db.release_rendering_thumb(ready).unwrap();
        let rendering_status: String = db
            .conn
            .query_row("SELECT thumb_status FROM files WHERE id = ?1", [rendering], |row| row.get(0))
            .unwrap();
        let ready_status: String = db
            .conn
            .query_row("SELECT thumb_status FROM files WHERE id = ?1", [ready], |row| row.get(0))
            .unwrap();
        assert_eq!(rendering_status, "none");
        assert_eq!(ready_status, "ok");
        let _ = std::fs::remove_dir_all(&dir);
    }


    #[test]
    fn image_thumb_is_claimed_before_an_earlier_stl() {
        let (dir, db) = scratch_db("thumb-order");
        let stl = db
            .insert_file("a.stl", "a.stl", "stl", 1, "sha-stl", 1, None, None)
            .unwrap();
        let png = db
            .insert_file("b.png", "b.png", "png", 1, "sha-png", 1, None, None)
            .unwrap();
        let claimed = db.claim_next_pending_thumb().unwrap().unwrap();
        assert_eq!(claimed.id, png);
        assert_eq!(status_of(&db, png).1, 0);
        assert_ne!(claimed.id, stl);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn requeue_retries_unavailable_images_only() {
        let (dir, db) = scratch_db("thumb-requeue");
        let png = db
            .insert_file_with_thumb_status("a.png", "a.png", "png", 1, "sha-png", 1, None, None, "unavailable")
            .unwrap();
        let jpg = db
            .insert_file_with_thumb_status("b.jpg", "b.jpg", "jpg", 1, "sha-jpg", 1, None, None, "unavailable")
            .unwrap();
        let ok = db
            .insert_file_with_thumb_status("c.png", "c.png", "png", 1, "sha-ok", 1, None, None, "ok")
            .unwrap();
        let unhashed = db
            .insert_file_with_thumb_status("d.png", "d.png", "png", 1, "", 1, None, None, "unhashed")
            .unwrap();
        let stl = db
            .insert_file_with_thumb_status("e.stl", "e.stl", "stl", 1, "sha-stl", 1, None, None, "unavailable")
            .unwrap();
        assert_eq!(db.requeue_unavailable_images().unwrap(), 2);
        assert_eq!(status_of(&db, png).0, "none");
        assert_eq!(status_of(&db, jpg).0, "none");
        assert_eq!(status_of(&db, ok).0, "ok");
        assert_eq!(status_of(&db, unhashed).0, "unhashed");
        assert_eq!(status_of(&db, stl).0, "unavailable");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn thumb_io_failure_retries_twice_then_unavailable() {
        let (dir, db) = scratch_db("thumb-io");
        let id = db
            .insert_file("a.png", "a.png", "png", 1, "sha", 1, None, None)
            .unwrap();
        db.note_thumb_io_failure(id).unwrap();
        assert_eq!(status_of(&db, id), ("none".into(), 1));
        db.note_thumb_io_failure(id).unwrap();
        assert_eq!(status_of(&db, id), ("none".into(), 2));
        db.note_thumb_io_failure(id).unwrap();
        assert_eq!(status_of(&db, id), ("unavailable".into(), 3));
        let _ = std::fs::remove_dir_all(&dir);
    }

