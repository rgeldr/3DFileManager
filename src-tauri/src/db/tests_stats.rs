    #[test]
    fn library_stats_sums_catalog_files_and_folders() {
        let (dir, db) = scratch_db("stats");
        assert_eq!(
            db.library_stats().unwrap(),
            LibraryStats {
                file_count: 0,
                folder_count: 0,
                size_bytes: 0,
            }
        );
        db.create_folder(None, "Toys", 0).unwrap();
        let missing = db
            .insert_file("gone.stl", "gone.stl", "stl", 1000, "sha-gone", 1, None, None)
            .unwrap();
        db.insert_file("kept.stl", "kept.stl", "stl", 2500, "sha-kept", 1, None, None)
            .unwrap();
        db.conn
            .execute("UPDATE files SET missing = 1 WHERE id = ?1", [missing])
            .unwrap();
        assert_eq!(
            db.library_stats().unwrap(),
            LibraryStats {
                file_count: 2,
                folder_count: 1,
                size_bytes: 3500,
            }
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
