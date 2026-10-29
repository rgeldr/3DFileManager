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
    fn pending_thumb_count_includes_none_and_rendering_not_missing() {
        let (dir, db) = scratch_db("thumb-pending-count");
        db.insert_file_with_thumb_status("a.png", "a.png", "png", 1, "sha-a", 1, None, None, "none")
            .unwrap();
        db.insert_file_with_thumb_status("b.png", "b.png", "png", 1, "sha-b", 1, None, None, "rendering")
            .unwrap();
        db.insert_file_with_thumb_status("c.png", "c.png", "png", 1, "sha-c", 1, None, None, "ok")
            .unwrap();
        db.insert_file_with_thumb_status("d.png", "d.png", "png", 1, "sha-d", 1, None, None, "unavailable")
            .unwrap();
        db.insert_file_with_thumb_status("e.png", "e.png", "png", 1, "", 1, None, None, "unhashed")
            .unwrap();
        db.insert_file_with_thumb_status("g.png", "g.png", "png", 1, "sha-g", 1, None, None, "hashing")
            .unwrap();
        db.insert_file_with_thumb_status("h.png", "h.png", "png", 1, "sha-h", 1, None, None, "hash_error")
            .unwrap();
        let missing = db
            .insert_file_with_thumb_status("f.png", "f.png", "png", 1, "sha-f", 1, None, None, "none")
            .unwrap();
        db.conn
            .execute("UPDATE files SET missing = 1 WHERE id = ?1", [missing])
            .unwrap();
        assert_eq!(db.pending_thumb_count().unwrap(), 2);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn set_file_sha_ready_skips_thumbnail_queue_for_step() {
        let (dir, db) = scratch_db("thumb-sha-step");
        let step = db
            .insert_file_with_thumb_status("part.step", "part.step", "step", 1, "", 1, None, None, "unhashed")
            .unwrap();
        let stl = db
            .insert_file_with_thumb_status("a.stl", "a.stl", "stl", 1, "", 1, None, None, "unhashed")
            .unwrap();
        db.set_file_sha_ready(step, "sha-step").unwrap();
        db.set_file_sha_ready(stl, "sha-stl").unwrap();
        assert_eq!(status_of(&db, step).0, "unavailable");
        assert_eq!(status_of(&db, stl).0, "none");
        assert_eq!(db.pending_thumb_count().unwrap(), 1);
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

    #[test]
    fn set_thumb_status_and_mark_thumb_ok() {
        let (dir, db) = scratch_db("thumb-status");
        let id = db
            .insert_file("a.png", "a.png", "png", 1, "sha-status", 1, None, None)
            .unwrap();
        db.conn
            .execute("UPDATE files SET thumb_attempts = 4 WHERE id = ?1", [id])
            .unwrap();
        db.set_thumb_status(id, "rendering").unwrap();
        assert_eq!(status_of(&db, id), ("rendering".into(), 4));
        db.mark_thumb_ok(id).unwrap();
        assert_eq!(status_of(&db, id), ("ok".into(), 0));
        db.set_thumb_status(id, "none").unwrap();
        assert_eq!(status_of(&db, id), ("none".into(), 0));
        db.set_thumb_status(999_999, "ok").unwrap();
        assert_eq!(status_of(&db, id).0, "none");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn next_pending_thumb_row_prefers_images_over_older_meshes() {
        let (dir, db) = scratch_db("thumb-next");
        assert!(db.next_pending_thumb_row().unwrap().is_none());
        let stl = db
            .insert_file_with_thumb_status("a.stl", "a.stl", "stl", 3, "sha-stl", 1, None, None, "none")
            .unwrap();
        let step = db
            .insert_file_with_thumb_status("b.step", "b.step", "step", 5, "sha-step", 2, None, None, "none")
            .unwrap();
        let missing = db
            .insert_file_with_thumb_status("c.jpg", "c.jpg", "jpg", 7, "sha-miss", 3, None, None, "none")
            .unwrap();
        db.mark_missing(missing, true).unwrap();
        let png = db
            .insert_file_with_thumb_status("d.png", "d.png", "png", 9, "sha-png", 4, None, None, "none")
            .unwrap();
        let rendering = db
            .insert_file_with_thumb_status("e.jpeg", "e.jpeg", "jpeg", 11, "sha-jpeg", 5, None, None, "rendering")
            .unwrap();

        let first: ThumbCandidate = db.next_pending_thumb_row().unwrap().expect("png");
        assert_eq!(first.id, png);
        assert_eq!(first.stored_relpath, "d.png");
        assert_eq!(first.ext, "png");
        assert_eq!(first.size_bytes, 9);
        assert_eq!(first.sha256, "sha-png");
        assert_eq!(status_of(&db, png).0, "none");
        assert_ne!(first.id, stl);
        assert_ne!(first.id, rendering);

        db.set_thumb_status(png, "ok").unwrap();
        let second: ThumbCandidate = db.next_pending_thumb_row().unwrap().expect("step");
        assert_eq!(second.id, step);
        assert_eq!(second.ext, "step");
        assert_eq!(second.stored_relpath, "b.step");
        assert_eq!(second.size_bytes, 5);
        assert_eq!(second.sha256, "sha-step");

        db.set_thumb_status(step, "ok").unwrap();
        let third: ThumbCandidate = db.next_pending_thumb_row().unwrap().expect("stl");
        assert_eq!(third.id, stl);
        assert_eq!(third.ext, "stl");
        db.set_thumb_status(stl, "unavailable").unwrap();
        assert!(db.next_pending_thumb_row().unwrap().is_none());
        assert_eq!(status_of(&db, missing).0, "none");
        assert_eq!(status_of(&db, rendering).0, "rendering");
        let _ = std::fs::remove_dir_all(&dir);
    }

