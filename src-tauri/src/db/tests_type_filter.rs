    #[test]
    fn type_filter_groups_jpg_and_combines_with_tags() {
        let (dir, db) = scratch_db("type-filter");
        let models = db.create_folder(None, "Models", 0).unwrap();
        let other = db.create_folder(None, "Other", 0).unwrap();
        let part = db
            .insert_file("a-part.stl", "Models/a-part.stl", "stl", 1, "sha-part", 1, Some(models.id), None)
            .unwrap();
        let photo = db
            .insert_file("b-photo.jpg", "Models/b-photo.jpg", "jpg", 1, "sha-jpg", 1, Some(models.id), None)
            .unwrap();
        let other_photo = db
            .insert_file("c-photo.jpeg", "Models/c-photo.jpeg", "jpeg", 1, "sha-jpeg", 1, Some(models.id), None)
            .unwrap();
        let note = db
            .insert_file("d-note.pdf", "Models/d-note.pdf", "pdf", 1, "sha-pdf", 1, Some(models.id), None)
            .unwrap();
        let remote = db
            .insert_file("a-remote.stl", "Other/a-remote.stl", "stl", 1, "sha-remote", 1, Some(other.id), None)
            .unwrap();
        db.set_tags(part, &["Humans".into()]).unwrap();
        db.set_tags(photo, &["Humans".into()]).unwrap();
        db.set_tags(remote, &["Humans".into()]).unwrap();

        let counts = db.type_counts(FolderFilter::Id(models.id), "", "", &[], TagMatch::Any).unwrap();
        let count = |id: &str| counts.iter().find(|row| row.id == id).unwrap().file_count;
        assert_eq!(count("stl"), 1);
        assert_eq!(count("jpg"), 2);
        assert_eq!(count("pdf"), 1);
        assert_eq!(count("obj"), 0);
        assert!(counts.iter().any(|row| row.id == "jpg" && row.exts == ["jpg", "jpeg"]));

        let humans = db
            .tag_counts(FolderFilter::Id(models.id), "", "", &[])
            .unwrap()
            .into_iter()
            .find(|tag| tag.name == "Humans")
            .unwrap();
        let tagged_types = db
            .type_counts(FolderFilter::Id(models.id), "", "", &[humans.id], TagMatch::Any)
            .unwrap();
        assert_eq!(tagged_types.iter().find(|row| row.id == "stl").unwrap().file_count, 1);
        assert_eq!(tagged_types.iter().find(|row| row.id == "jpg").unwrap().file_count, 1);
        let jpg_tags = db.tag_counts(FolderFilter::Id(models.id), "", "", &["jpg"]).unwrap();
        assert_eq!(jpg_tags.iter().find(|tag| tag.name == "Humans").unwrap().file_count, 1);

        let ids = |rows: Vec<FileRow>| rows.into_iter().map(|row| row.id).collect::<Vec<_>>();
        let images = db
            .query_files(FileQuery {
                folder: FolderFilter::Id(models.id),
                query: "",
                creator: "",
                tag: "",
                tag_ids: &[],
                tag_match: TagMatch::Any,
                exts: &["jpg", "jpeg"],
                sort: "name",
                sort_direction: "asc",
                limit: None,
                offset: 0,
            })
            .unwrap();
        assert_eq!(ids(images), vec![photo, other_photo]);

        let stl_humans = db
            .query_files(FileQuery {
                folder: FolderFilter::Id(models.id),
                query: "",
                creator: "",
                tag: "",
                tag_ids: &[humans.id],
                tag_match: TagMatch::Any,
                exts: &["STL"],
                sort: "name",
                sort_direction: "asc",
                limit: None,
                offset: 0,
            })
            .unwrap();
        assert_eq!(ids(stl_humans), vec![part]);

        let library = db
            .query_files(FileQuery {
                folder: FolderFilter::All,
                query: "",
                creator: "",
                tag: "",
                tag_ids: &[humans.id],
                tag_match: TagMatch::Any,
                exts: &["stl"],
                sort: "name",
                sort_direction: "asc",
                limit: None,
                offset: 0,
            })
            .unwrap();
        assert_eq!(ids(library), vec![part, remote]);

        let page = db
            .query_files(FileQuery {
                folder: FolderFilter::Id(models.id),
                query: "",
                creator: "",
                tag: "",
                tag_ids: &[],
                tag_match: TagMatch::Any,
                exts: &["jpg", "JPEG"],
                sort: "name",
                sort_direction: "asc",
                limit: Some(1),
                offset: 1,
            })
            .unwrap();
        assert_eq!(ids(page), vec![other_photo]);

        let ignored = db
            .query_files(FileQuery {
                folder: FolderFilter::Id(models.id),
                query: "",
                creator: "",
                tag: "",
                tag_ids: &[],
                tag_match: TagMatch::Any,
                exts: &["exe"],
                sort: "name",
                sort_direction: "asc",
                limit: None,
                offset: 0,
            })
            .unwrap();
        assert_eq!(ids(ignored), vec![part, photo, other_photo, note]);
        let _ = std::fs::remove_dir_all(&dir);
    }
