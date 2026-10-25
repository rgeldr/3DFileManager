    #[test]
    fn tag_filter_any_all_counts_and_page() {
        let (dir, db) = scratch_db("tag-filter");
        let models = db.create_folder(None, "Models", 0).unwrap();
        let other = db.create_folder(None, "Other", 0).unwrap();
        let both = db
            .insert_file("both.stl", "Models/both.stl", "stl", 1, "sha-both", 1, Some(models.id), None)
            .unwrap();
        let only_a = db
            .insert_file("onlya.stl", "Models/onlya.stl", "stl", 1, "sha-a", 1, Some(models.id), None)
            .unwrap();
        let only_b = db
            .insert_file("onlyb.stl", "Models/onlyb.stl", "stl", 1, "sha-b", 1, Some(models.id), None)
            .unwrap();
        let plain = db
            .insert_file("plain.stl", "Models/plain.stl", "stl", 1, "sha-p", 1, Some(models.id), None)
            .unwrap();
        let sibling = db
            .insert_file("sib.stl", "Other/sib.stl", "stl", 1, "sha-s", 1, Some(other.id), None)
            .unwrap();
        db.set_tags(both, &["Alpha".into(), "Beta".into()]).unwrap();
        db.set_tags(only_a, &["Alpha".into()]).unwrap();
        db.set_tags(only_b, &["Beta".into()]).unwrap();
        db.set_tags(sibling, &["Alpha".into()]).unwrap();

        let counts = db.tag_counts(FolderFilter::Id(models.id), "", "", &[]).unwrap();
        assert_eq!(
            counts.iter().map(|tag| tag.name.as_str()).collect::<Vec<_>>(),
            vec!["Alpha", "Beta"]
        );
        let alpha = counts.iter().find(|tag| tag.name == "Alpha").unwrap();
        let beta = counts.iter().find(|tag| tag.name == "Beta").unwrap();
        assert_eq!(alpha.file_count, 2);
        assert_eq!(beta.file_count, 2);
        let all_counts = db.tag_counts(FolderFilter::All, "", "", &[]).unwrap();
        assert_eq!(all_counts.iter().find(|tag| tag.name == "Alpha").unwrap().file_count, 3);

        let ids = |rows: Vec<FileRow>| rows.into_iter().map(|row| row.id).collect::<Vec<_>>();
        let any = db
            .query_files(FileQuery {
                folder: FolderFilter::Id(models.id),
                query: "",
                creator: "",
                tag: "",
                tag_ids: &[alpha.id, beta.id],
                tag_match: TagMatch::Any,
                exts: &[],
                sort: "name",
                sort_direction: "asc",
                limit: None,
                offset: 0,
            })
            .unwrap();
        assert_eq!(ids(any), vec![both, only_a, only_b]);

        let all = db
            .query_files(FileQuery {
                folder: FolderFilter::Id(models.id),
                query: "",
                creator: "",
                tag: "",
                tag_ids: &[alpha.id, beta.id],
                tag_match: TagMatch::All,
                exts: &[],
                sort: "name",
                sort_direction: "asc",
                limit: None,
                offset: 0,
            })
            .unwrap();
        assert_eq!(ids(all), vec![both]);

        let page = db
            .query_files(FileQuery {
                folder: FolderFilter::Id(models.id),
                query: "",
                creator: "",
                tag: "",
                tag_ids: &[alpha.id, beta.id],
                tag_match: TagMatch::Any,
                exts: &[],
                sort: "name",
                sort_direction: "asc",
                limit: Some(1),
                offset: 1,
            })
            .unwrap();
        assert_eq!(ids(page), vec![only_a]);

        let library = db
            .query_files(FileQuery {
                folder: FolderFilter::All,
                query: "",
                creator: "",
                tag: "",
                tag_ids: &[alpha.id],
                tag_match: TagMatch::Any,
                exts: &[],
                sort: "name",
                sort_direction: "asc",
                limit: None,
                offset: 0,
            })
            .unwrap();
        assert_eq!(ids(library), vec![both, only_a, sibling]);

        let searched = db
            .query_files(FileQuery {
                folder: FolderFilter::Id(models.id),
                query: "onlya",
                creator: "",
                tag: "",
                tag_ids: &[alpha.id, beta.id],
                tag_match: TagMatch::Any,
                exts: &[],
                sort: "name",
                sort_direction: "asc",
                limit: None,
                offset: 0,
            })
            .unwrap();
        assert_eq!(ids(searched), vec![only_a]);
        let searched_counts = db.tag_counts(FolderFilter::Id(models.id), "onlya", "", &[]).unwrap();
        assert_eq!(searched_counts.iter().find(|tag| tag.name == "Alpha").unwrap().file_count, 1);
        assert!(searched_counts.iter().all(|tag| tag.name != "Beta"));

        let deduped = db
            .query_files(FileQuery {
                folder: FolderFilter::Id(models.id),
                query: "",
                creator: "",
                tag: "",
                tag_ids: &[alpha.id, beta.id, alpha.id],
                tag_match: TagMatch::All,
                exts: &[],
                sort: "name",
                sort_direction: "asc",
                limit: None,
                offset: 0,
            })
            .unwrap();
        assert_eq!(ids(deduped), vec![both]);

        let in_folder = db.list_files(FolderFilter::Id(models.id), "", "", "", "name", "asc").unwrap();
        assert!(in_folder.iter().any(|row| row.id == plain));
        assert!(!in_folder.iter().any(|row| row.id == sibling));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn tag_filter_without_creator_includes_nested_files() {
        let (dir, db) = scratch_db("tag-scope");
        let parent = db.create_folder(None, "3DFiles", 0).unwrap();
        let child = db.create_folder(Some(parent.id), "Bits", 0).unwrap();
        let blank = db
            .insert_file("blank.stl", "3DFiles/Bits/blank.stl", "stl", 1, "sha-blank", 1, Some(child.id), None)
            .unwrap();
        let guild = db
            .insert_file("guild.stl", "3DFiles/Bits/guild.stl", "stl", 1, "sha-guild", 1, Some(child.id), None)
            .unwrap();
        let plain = db
            .insert_file("plain.stl", "3DFiles/Bits/plain.stl", "stl", 1, "sha-plain", 1, Some(child.id), None)
            .unwrap();
        db.set_tags(blank, &["Humans".into()]).unwrap();
        db.set_tags(guild, &["Humans".into()]).unwrap();
        db.update_file(guild, "guild", "Artisan Guild", "", Some(child.id)).unwrap();

        let humans = db
            .tag_counts(FolderFilter::All, "", "", &[])
            .unwrap()
            .into_iter()
            .find(|tag| tag.name == "Humans")
            .unwrap();
        assert_eq!(humans.file_count, 2);
        let ids = |rows: Vec<FileRow>| rows.into_iter().map(|row| row.id).collect::<Vec<_>>();
        let query = |folder, creator: &str, mode| {
            db.query_files(FileQuery {
                folder,
                query: "",
                creator,
                tag: "",
                tag_ids: &[humans.id],
                tag_match: mode,
                exts: &[],
                sort: "name",
                sort_direction: "asc",
                limit: None,
                offset: 0,
            })
            .unwrap()
        };

        let parent_only = query(FolderFilter::Id(parent.id), "", TagMatch::Any);
        assert!(parent_only.is_empty());

        let any = query(FolderFilter::All, "", TagMatch::Any);
        assert!(any.iter().any(|row| row.id == blank && row.creator.is_empty()));
        assert!(!any.iter().any(|row| row.id == plain));
        assert_eq!(ids(any), vec![blank, guild]);

        let all_match = query(FolderFilter::All, "", TagMatch::All);
        assert_eq!(ids(all_match), vec![blank, guild]);

        let named = query(FolderFilter::All, "Artisan Guild", TagMatch::Any);
        assert_eq!(ids(named), vec![guild]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn folder_tag_counts_omit_tags_that_only_exist_in_another_folder() {
        let (dir, db) = scratch_db("tag-other-folder");
        let models = db.create_folder(None, "Models", 0).unwrap();
        let other = db.create_folder(None, "Other", 0).unwrap();
        let here = db
            .insert_file("here.stl", "Models/here.stl", "stl", 1, "sha-here", 1, Some(models.id), None)
            .unwrap();
        let there = db
            .insert_file("there.stl", "Other/there.stl", "stl", 1, "sha-there", 1, Some(other.id), None)
            .unwrap();
        db.set_tags(here, &["Local".into()]).unwrap();
        db.set_tags(there, &["RemoteOnly".into()]).unwrap();

        let counts = db.tag_counts(FolderFilter::Id(models.id), "", "", &[]).unwrap();
        assert_eq!(
            counts.iter().map(|tag| (tag.name.as_str(), tag.file_count)).collect::<Vec<_>>(),
            vec![("Local", 1)]
        );
        let all = db.tag_counts(FolderFilter::All, "", "", &[]).unwrap();
        assert!(all.iter().any(|tag| tag.name == "RemoteOnly" && tag.file_count == 1));
        let _ = std::fs::remove_dir_all(&dir);
    }
