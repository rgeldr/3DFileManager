    #[test]
    fn move_files_cancel_keeps_the_rest() {
        let dir = std::env::temp_dir().join(format!("filelib-movefiles-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let db = open(&dir).unwrap();
        let root = dir.join("library");
        std::fs::create_dir_all(&root).unwrap();
        let mut settings = Settings::default();
        settings.library_root = Some(root.to_string_lossy().to_string());
        db.save_settings(&settings).unwrap();
        let dest = db.create_folder(None, "Dest", 0).unwrap();
        std::fs::write(root.join("a.stl"), b"a").unwrap();
        std::fs::write(root.join("b.stl"), b"b").unwrap();
        let first = db
            .insert_file("a.stl", "a.stl", "stl", 1, "sha-1", 1, None, None)
            .unwrap();
        let second = db
            .insert_file("b.stl", "b.stl", "stl", 1, "sha-2", 1, None, None)
            .unwrap();
        let cancel = AtomicBool::new(false);
        let cancelled = db
            .move_files_with(&[first, second], Some(dest.id), &cancel, |progress| {
                if progress.current >= 1 {
                    cancel.store(true, std::sync::atomic::Ordering::SeqCst);
                }
            })
            .unwrap();
        assert!(cancelled);
        let moved = db.file_location(first).unwrap();
        let stayed = db.file_location(second).unwrap();
        assert_eq!(moved.folder_id, Some(dest.id));
        assert!(root.join(&moved.stored_relpath).is_file());
        assert_eq!(stayed.folder_id, None);
        assert!(root.join("b.stl").is_file());
        let _ = std::fs::remove_dir_all(&dir);
    }

    fn rename_row(db: &AppDb, id: i64) -> (String, String, String, String) {
        db.conn
            .query_row(
                "SELECT original_name, sort_name, stored_relpath, ext FROM files WHERE id = ?1",
                [id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap()
    }

    #[test]
    fn rename_file_updates_the_disk_name_and_the_catalog() {
        let (dir, db) = scratch_db("rename-file");
        let root = db.library_root().unwrap();
        let folder = db.create_folder(None, "Models", 0).unwrap();
        std::fs::write(root.join(&folder.relpath).join("old.stl"), b"mesh").unwrap();
        let id = db
            .insert_file("old.stl", &format!("{}/old.stl", folder.relpath), "stl", 4, "sha-old", 1, Some(folder.id), None)
            .unwrap();
        db.rename_library_file(id, "New Model").unwrap();
        assert!(!root.join(&folder.relpath).join("old.stl").exists());
        assert_eq!(std::fs::read(root.join(&folder.relpath).join("New Model.stl")).unwrap(), b"mesh");
        assert_eq!(
            rename_row(&db, id),
            (
                "New Model.stl".into(),
                "New Model".into(),
                format!("{}/New Model.stl", folder.relpath),
                "stl".into(),
            )
        );
        db.rename_library_file(id, "New Model.obj").unwrap();
        assert!(root.join(&folder.relpath).join("New Model.obj").is_file());
        assert_eq!(rename_row(&db, id).3, "obj");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn rename_file_refuses_a_collision_an_invalid_name_and_a_missing_file() {
        let (dir, db) = scratch_db("rename-refuse");
        let root = db.library_root().unwrap();
        std::fs::write(root.join("a.stl"), b"a").unwrap();
        std::fs::write(root.join("Taken.STL"), b"taken").unwrap();
        let id = db.insert_file("a.stl", "a.stl", "stl", 1, "sha-a", 1, None, None).unwrap();
        let other = db
            .insert_file("ghost.stl", "ghost.stl", "stl", 1, "sha-g", 1, None, None)
            .unwrap();
        let collision = db.rename_library_file(id, "taken").unwrap_err();
        assert!(collision.contains("already in this folder"));
        assert_eq!(std::fs::read(root.join("a.stl")).unwrap(), b"a");
        assert_eq!(rename_row(&db, id).2, "a.stl");
        let invalid = db.rename_library_file(id, "a:b").unwrap_err();
        assert!(invalid.contains("Windows"));
        assert!(root.join("a.stl").is_file());
        let missing = db.rename_library_file(other, "ghost-renamed").unwrap_err();
        assert!(missing.contains("missing on disk"));
        assert_eq!(rename_row(&db, other).2, "ghost.stl");
        let outside = dir.join("secret.stl");
        std::fs::write(&outside, b"secret").unwrap();
        let escaped = db
            .insert_file("secret.stl", "../secret.stl", "stl", 6, "sha-x", 1, None, None)
            .unwrap();
        assert!(db.rename_library_file(escaped, "safe").is_err());
        assert_eq!(std::fs::read(&outside).unwrap(), b"secret");
        assert!(!root.join("safe.stl").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn failed_catalog_update_rolls_the_rename_back() {
        let dir = std::env::temp_dir().join(format!("filelib-rename-undo-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let source = dir.join("old.stl");
        let dest = dir.join("new.stl");
        std::fs::write(&source, b"mesh").unwrap();
        let err = rename_then(&source, &dest, || Err("database is locked".into())).unwrap_err();
        assert!(err.contains("database is locked"));
        assert_eq!(std::fs::read(&source).unwrap(), b"mesh");
        assert!(!dest.exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn directory_has_other_name_matches_case_and_skips_the_source() {
        let dir = std::env::temp_dir().join(format!("filelib-dirname-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let taken = dir.join("Taken.STL");
        let other = dir.join("other.stl");
        std::fs::write(&taken, b"taken").unwrap();
        std::fs::write(&other, b"other").unwrap();
        std::os::unix::fs::symlink("Taken.STL", dir.join("alias.stl")).unwrap();

        assert!(super::directory_has_other_name(&dir, "taken.stl", &other).unwrap());
        assert!(!super::directory_has_other_name(&dir, "other.stl", &other).unwrap());
        assert!(!super::directory_has_other_name(&dir, "nope.stl", &other).unwrap());
        assert!(!super::directory_has_other_name(&dir, "alias.stl", &taken).unwrap());
        assert!(!super::directory_has_other_name(&dir, "TAKEN.stl", &taken).unwrap());

        let err = super::directory_has_other_name(&other, "x.stl", &other).unwrap_err();
        assert_eq!(err, "Not a directory (os error 20)");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn file_mtime_reads_modified_time_or_zero() {
        let dir = std::env::temp_dir().join(format!("filelib-mtime-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("timed.stl");
        std::fs::write(&path, b"mesh").unwrap();
        let expected = std::fs::metadata(&path)
            .unwrap()
            .modified()
            .unwrap()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        assert_eq!(super::file_mtime(&path), expected);
        assert!(expected > 0);
        assert_eq!(super::file_mtime(&dir.join("missing.stl")), 0);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn sha_exists_and_sha_exists_other_ignore_empty_and_missing() {
        let (dir, db) = scratch_db("sha-exists");
        assert!(!db.sha_exists("").unwrap());
        assert!(!db.sha_exists("absent").unwrap());
        assert!(!db.sha_exists_other("", 1).unwrap());
        assert!(!db.sha_exists_other("absent", 1).unwrap());

        let kept = db
            .insert_file("a.stl", "a.stl", "stl", 1, "sha-shared", 1, None, None)
            .unwrap();
        let other = db
            .insert_file("b.stl", "b.stl", "stl", 1, "sha-shared", 1, None, None)
            .unwrap();
        let gone = db
            .insert_file("c.stl", "c.stl", "stl", 1, "sha-gone", 1, None, None)
            .unwrap();
        db.mark_missing(gone, true).unwrap();

        assert!(db.sha_exists("sha-shared").unwrap());
        assert!(!db.sha_exists("sha-gone").unwrap());
        assert!(db.sha_exists_other("sha-shared", kept).unwrap());
        assert!(db.sha_exists_other("sha-shared", other).unwrap());
        assert!(db.sha_exists_other("sha-shared", gone).unwrap());
        assert!(!db.sha_exists_other("sha-gone", kept).unwrap());
        db.mark_missing(other, true).unwrap();
        assert!(db.sha_exists("sha-shared").unwrap());
        assert!(!db.sha_exists_other("sha-shared", kept).unwrap());
        assert!(db.sha_exists_other("sha-shared", other).unwrap());
        assert!(!db.sha_exists_other("", kept).unwrap());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn unhashed_queue_claim_count_and_reset() {
        let (dir, db) = scratch_db("unhashed");
        let missing = db
            .insert_file_with_thumb_status("gone.stl", "gone.stl", "stl", 1, "", 1, None, None, "unhashed")
            .unwrap();
        db.mark_missing(missing, true).unwrap();
        let first = db
            .insert_file_with_thumb_status("a.stl", "a.stl", "stl", 1, "", 1, None, None, "unhashed")
            .unwrap();
        let second = db
            .insert_file_with_thumb_status("b.stl", "b.stl", "stl", 1, "", 1, None, None, "unhashed")
            .unwrap();
        let hashing = db
            .insert_file_with_thumb_status("c.stl", "c.stl", "stl", 1, "", 1, None, None, "hashing")
            .unwrap();
        let ready = db
            .insert_file_with_thumb_status("d.stl", "d.stl", "stl", 1, "sha-d", 1, None, None, "ok")
            .unwrap();

        assert_eq!(db.count_unhashed().unwrap(), 2);
        let peeked: UnhashedCandidate = db.next_unhashed_file().unwrap().expect("unhashed row");
        assert_eq!(peeked.id, first);
        assert_eq!(peeked.stored_relpath, "a.stl");
        assert_eq!(status_of(&db, first).0, "unhashed");

        let claimed: UnhashedCandidate = db.claim_next_unhashed().unwrap().expect("claimed row");
        assert_eq!(claimed.id, first);
        assert_eq!(claimed.stored_relpath, "a.stl");
        assert_eq!(status_of(&db, first).0, "hashing");
        assert_eq!(db.count_unhashed().unwrap(), 1);
        let next: UnhashedCandidate = db.next_unhashed_file().unwrap().expect("second row");
        assert_eq!(next.id, second);

        db.reset_hashing_to_unhashed().unwrap();
        assert_eq!(status_of(&db, first).0, "unhashed");
        assert_eq!(status_of(&db, hashing).0, "unhashed");
        assert_eq!(status_of(&db, second).0, "unhashed");
        assert_eq!(status_of(&db, ready).0, "ok");
        assert_eq!(status_of(&db, missing).0, "unhashed");
        assert_eq!(db.count_unhashed().unwrap(), 3);

        assert_eq!(db.claim_next_unhashed().unwrap().unwrap().id, first);
        assert_eq!(db.claim_next_unhashed().unwrap().unwrap().id, second);
        assert_eq!(db.claim_next_unhashed().unwrap().unwrap().id, hashing);
        assert!(db.claim_next_unhashed().unwrap().is_none());
        assert!(db.next_unhashed_file().unwrap().is_none());
        assert_eq!(db.count_unhashed().unwrap(), 0);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn import_batch_begin_commit_and_rollback() {
        let (dir, mut db) = scratch_db("import-batch");
        assert_eq!(
            db.import_batch_commit().unwrap_err(),
            "cannot commit - no transaction is active"
        );
        assert_eq!(
            db.import_batch_rollback().unwrap_err(),
            "cannot rollback - no transaction is active"
        );

        db.import_batch_begin().unwrap();
        let sync: i64 = db
            .conn
            .pragma_query_value(None, "synchronous", |row| row.get(0))
            .unwrap();
        assert_eq!(sync, 1);
        assert_eq!(
            db.import_batch_begin().unwrap_err(),
            "Safety level may not be changed inside a transaction"
        );
        let rolled = db
            .insert_file("a.stl", "a.stl", "stl", 3, "sha-batch", 8, None, None)
            .unwrap();
        assert!(db.file_row_exists(rolled).unwrap());
        db.import_batch_rollback().unwrap();
        assert!(!db.file_row_exists(rolled).unwrap());

        db.import_batch_begin().unwrap();
        let kept = db
            .insert_file("b.stl", "b.stl", "stl", 3, "sha-kept", 8, None, None)
            .unwrap();
        db.import_batch_commit().unwrap();
        assert!(db.file_row_exists(kept).unwrap());
        let sha: String = db
            .conn
            .query_row("SELECT sha256 FROM files WHERE id = ?1", [kept], |row| row.get(0))
            .unwrap();
        assert_eq!(sha, "sha-kept");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn sync_tags_text_rewrites_tag_string() {
        let (dir, db) = scratch_db("tag-string");
        let id = db
            .insert_file("a.stl", "a.stl", "stl", 1, "sha-tags", 1, None, None)
            .unwrap();
        db.set_tags(id, &["zeta".into(), "  ".into(), "alpha".into()]).unwrap();
        assert_eq!(db.tag_string(id).unwrap(), "alpha zeta");
        let stored: String = db
            .conn
            .query_row("SELECT tags_text FROM files WHERE id = ?1", [id], |row| row.get(0))
            .unwrap();
        assert_eq!(stored, "alpha zeta");
        db.conn
            .execute("UPDATE files SET tags_text = 'stale' WHERE id = ?1", [id])
            .unwrap();
        db.sync_tags_text(id).unwrap();
        let refreshed: String = db
            .conn
            .query_row("SELECT tags_text FROM files WHERE id = ?1", [id], |row| row.get(0))
            .unwrap();
        assert_eq!(refreshed, "alpha zeta");
        assert_eq!(db.tag_string(404).unwrap(), "");
        db.sync_tags_text(404).unwrap();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn catalog_index_trash_and_remove_catalogued_file() {
        let (dir, db) = scratch_db("catalog-index");
        let root = db.library_root().unwrap();
        let folder = db.create_folder(None, "Models", 0).unwrap();
        std::fs::write(root.join("Models").join("mesh.stl"), b"mesh").unwrap();
        let id = db
            .insert_file(
                "mesh.stl",
                "Models/mesh.stl",
                "stl",
                4,
                "sha-mesh",
                9,
                Some(folder.id),
                None,
            )
            .unwrap();
        let shared = db
            .insert_file("copy.stl", "copy.stl", "stl", 4, "sha-mesh", 9, None, None)
            .unwrap();
        let empty = db
            .insert_file("empty.stl", "empty.stl", "stl", 1, "", 3, None, None)
            .unwrap();
        let missing = db
            .insert_file("gone.stl", "gone.stl", "stl", 2, "sha-gone", 4, None, None)
            .unwrap();
        db.mark_missing(missing, true).unwrap();
        std::fs::write(thumb_path(&db.data_dir, "sha-mesh"), b"png").unwrap();
        std::fs::write(thumb_path(&db.data_dir, ""), b"dot").unwrap();
        std::fs::write(thumb_path(&db.data_dir, "sha-gone"), b"keep").unwrap();

        let loc: FileLoc = db.file_location(id).unwrap();
        assert_eq!(loc.stored_relpath, "Models/mesh.stl");
        assert_eq!(loc.folder_id, Some(folder.id));
        assert_eq!(loc.sha256, "sha-mesh");
        assert_eq!(loc.original_name, "mesh.stl");

        let items: Vec<TrashItem> = db.trash_items(&[id, missing]).unwrap();
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].id, id);
        assert_eq!(items[0].path, root.join("Models/mesh.stl"));
        assert_eq!(items[0].sha256, "sha-mesh");
        assert_eq!(items[0].name, "mesh.stl");
        assert_eq!(items[0].bytes, 4);
        assert_eq!(items[1].id, missing);
        assert_eq!(items[1].name, "gone.stl");
        assert_eq!(items[1].sha256, "sha-gone");
        assert_eq!(items[1].bytes, 0);
        assert_eq!(items[1].path, root.join("gone.stl"));

        let rows: Vec<IndexRow> = db.all_file_index().unwrap();
        let indexed = rows.iter().find(|row| row.id == id).unwrap();
        assert_eq!(indexed.stored_relpath, "Models/mesh.stl");
        assert_eq!(indexed.sha256, "sha-mesh");
        assert_eq!(indexed.size_bytes, 4);
        assert_eq!(indexed.mtime, 9);
        assert_eq!(indexed.folder_id, Some(folder.id));
        assert!(!indexed.missing);
        let gone = rows.iter().find(|row| row.id == missing).unwrap();
        assert!(gone.missing);
        assert_eq!(gone.sha256, "sha-gone");
        assert_eq!(rows.len(), 4);

        db.remove_catalogued_file(shared, "sha-mesh").unwrap();
        assert!(!db.file_row_exists(shared).unwrap());
        assert!(thumb_path(&db.data_dir, "sha-mesh").is_file());
        db.remove_catalogued_file(id, "sha-mesh").unwrap();
        assert!(!db.file_row_exists(id).unwrap());
        assert!(!thumb_path(&db.data_dir, "sha-mesh").exists());
        db.remove_catalogued_file(empty, "").unwrap();
        assert!(thumb_path(&db.data_dir, "").is_file());
        assert!(thumb_path(&db.data_dir, "sha-gone").is_file());
        assert!(db.file_row_exists(missing).unwrap());
        let _ = std::fs::remove_dir_all(&dir);
    }

