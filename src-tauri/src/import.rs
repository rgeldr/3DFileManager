use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};
use walkdir::WalkDir;
use zip::ZipArchive;

use crate::db::AppDb;
use crate::names::{extension_of, is_archive, is_supported_file, unique_file_path};

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    pub imported_ids: Vec<i64>,
    pub imported_count: u32,
    pub duplicate_count: u32,
    pub unsupported_count: u32,
    pub failed: Vec<String>,
    pub recycle_paths: Vec<String>,
}

pub struct ImportProgress {
    pub current: u32,
    pub total: u32,
    pub message: String,
}

struct ImportProgressCtx<F: FnMut(ImportProgress)> {
    current: u32,
    total: u32,
    on_progress: F,
}

impl<F: FnMut(ImportProgress)> ImportProgressCtx<F> {
    fn emit(&mut self, message: impl Into<String>) {
        self.on_progress(ImportProgress {
            current: self.current,
            total: self.total.max(1),
            message: message.into(),
        });
    }

    fn tick(&mut self, message: impl Into<String>) {
        self.current += 1;
        self.emit(message);
    }

    /// An archive is counted as one file during the pre-scan; replace that unit with extracted files.
    fn adjust_total_for_archive_contents(&mut self, inner_file_count: u32) {
        self.total = self.total.saturating_sub(1) + inner_file_count;
    }
}

fn count_files_in_dir(source_root: &Path) -> u32 {
    let mut count = 0u32;
    for entry in WalkDir::new(source_root).follow_links(false) {
        if entry
            .ok()
            .map(|e| e.file_type().is_file())
            .unwrap_or(false)
        {
            count += 1;
        }
    }
    count
}

fn count_job_files(path: &Path) -> u32 {
    if path.is_dir() {
        count_files_in_dir(path)
    } else {
        1
    }
}

pub fn import_paths<F: FnMut(ImportProgress)>(
    db: &AppDb,
    paths: &[String],
    target_folder: Option<i64>,
    on_progress: F,
) -> Result<ImportSummary, String> {
    let root = db.library_root()?;
    let mut summary = ImportSummary {
        imported_ids: Vec::new(),
        imported_count: 0,
        duplicate_count: 0,
        unsupported_count: 0,
        failed: Vec::new(),
        recycle_paths: Vec::new(),
    };
    let mut jobs = Vec::new();
    for raw in paths {
        let path = PathBuf::from(raw);
        if !path.exists() {
            summary.failed.push(format!("Missing path: {raw}"));
            continue;
        }
        if path_within(&path, &root) {
            summary
                .failed
                .push(format!("Skipped a path inside the library: {raw}"));
            continue;
        }
        jobs.push(path);
    }
    let mut progress = ImportProgressCtx {
        current: 0,
        total: 0,
        on_progress,
    };
    progress.emit("Counting files");
    let file_total = jobs.iter().map(|p| count_job_files(p)).sum::<u32>();
    progress.total = file_total;
    progress.emit("Importing…");
    for path in jobs {
        let ext = extension_of(&path.file_name().unwrap_or_default().to_string_lossy());
        if path.is_dir() {
            import_tree(db, &path, target_folder, None, 0, &mut summary, &mut progress)?;
        } else if is_archive(&ext) {
            import_archive(db, &path, target_folder, 0, &mut summary, &mut progress)?;
        } else {
            import_file(db, &path, target_folder, None, true, &mut summary)?;
            let label = path
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| path.display().to_string());
            progress.tick(label);
        }
    }
    progress.current = progress.total.max(progress.current);
    progress.emit("Import finished");
    Ok(summary)
}

fn import_tree<F: FnMut(ImportProgress)>(
    db: &AppDb,
    source_root: &Path,
    target_folder: Option<i64>,
    source_archive: Option<&str>,
    archive_depth: u8,
    summary: &mut ImportSummary,
    progress: &mut ImportProgressCtx<F>,
) -> Result<(), String> {
    for entry in WalkDir::new(source_root).follow_links(false) {
        let entry = match entry {
            Ok(entry) => entry,
            Err(err) => {
                summary.failed.push(err.to_string());
                continue;
            }
        };
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let ext = extension_of(&path.file_name().unwrap_or_default().to_string_lossy());
        let rel_parent = path
            .parent()
            .unwrap_or(source_root)
            .strip_prefix(source_root)
            .unwrap_or(Path::new(""))
            .to_path_buf();
        let folder_id = db.ensure_folder_chain(target_folder, &rel_parent)?;
        if is_archive(&ext) {
            if archive_depth < 1 {
                import_archive(db, path, folder_id, archive_depth + 1, summary, progress)?;
            } else {
                summary.unsupported_count += 1;
                progress.tick(file_name_of(path));
            }
            continue;
        }
        import_file(
            db,
            path,
            folder_id,
            source_archive,
            source_archive.is_none(),
            summary,
        )?;
        progress.tick(file_name_of(path));
    }
    Ok(())
}

fn file_name_of(path: &Path) -> String {
    path.file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| path.display().to_string())
}

fn import_archive<F: FnMut(ImportProgress)>(
    db: &AppDb,
    archive_path: &Path,
    target_folder: Option<i64>,
    depth: u8,
    summary: &mut ImportSummary,
    progress: &mut ImportProgressCtx<F>,
) -> Result<(), String> {
    let stem = archive_path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "archive".into());
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let temp = db
        .data_dir
        .join("tmp-import")
        .join(format!("{}-{}", std::process::id(), stamp));
    let _ = fs::remove_dir_all(&temp);
    fs::create_dir_all(&temp).map_err(|e| e.to_string())?;
    let extract_result = extract_any(archive_path, &temp);
    if let Err(err) = extract_result {
        summary.failed.push(format!(
            "{}: {err}",
            archive_path.display()
        ));
        let _ = fs::remove_dir_all(&temp);
        progress.tick(file_name_of(archive_path));
        return Ok(());
    }
    progress.adjust_total_for_archive_contents(count_files_in_dir(&temp));
    let before_failed = summary.failed.len();
    let before_imported = summary.imported_count;
    let before_dup = summary.duplicate_count;
    let archive_name = archive_path
        .file_name()
        .map(|s| s.to_string_lossy().to_string());
    let holder = db.ensure_folder_chain(target_folder, Path::new(&stem))?;
    import_tree(
        db,
        &temp,
        holder,
        archive_name.as_deref(),
        depth,
        summary,
        progress,
    )?;
    let _ = fs::remove_dir_all(&temp);
    let imported_something = summary.imported_count > before_imported || summary.duplicate_count > before_dup;
    if summary.failed.len() == before_failed && imported_something {
        summary
            .recycle_paths
            .push(archive_path.to_string_lossy().to_string());
    }
    Ok(())
}

fn import_file(
    db: &AppDb,
    source: &Path,
    folder_id: Option<i64>,
    source_archive: Option<&str>,
    can_recycle: bool,
    summary: &mut ImportSummary,
) -> Result<(), String> {
    let file_name = source
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".into());
    let ext = extension_of(&file_name);
    if !is_supported_file(&ext) {
        summary.unsupported_count += 1;
        return Ok(());
    }
    let sha = match hash_file(source) {
        Ok(sha) => sha,
        Err(err) => {
            summary.failed.push(format!("{}: {err}", source.display()));
            return Ok(());
        }
    };
    if db.sha_exists(&sha)? {
        summary.duplicate_count += 1;
        return Ok(());
    }
    let root = db.library_root()?;
    let dest_dir = match folder_id {
        Some(id) => root.join(db.folder_relpath(id)?),
        None => root,
    };
    fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
    let dest = unique_file_path(&dest_dir, &file_name);
    if let Err(err) = fs::copy(source, &dest) {
        summary
            .failed
            .push(format!("{}: {err}", source.display()));
        return Ok(());
    }
    let meta = match dest.metadata() {
        Ok(meta) => meta,
        Err(err) => {
            summary.failed.push(err.to_string());
            return Ok(());
        }
    };
    let rel = dest
        .strip_prefix(db.library_root()?)
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .replace('\\', "/");
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    match db.insert_file(
        &file_name,
        &rel,
        &ext,
        meta.len() as i64,
        &sha,
        mtime,
        folder_id,
        source_archive,
    ) {
        Ok(id) => {
            summary.imported_ids.push(id);
            summary.imported_count += 1;
            if can_recycle {
                summary
                    .recycle_paths
                    .push(source.to_string_lossy().to_string());
            }
        }
        Err(err) => {
            let _ = fs::remove_file(&dest);
            summary.failed.push(format!("{file_name}: {err}"));
        }
    }
    Ok(())
}

fn extract_any(archive: &Path, dest: &Path) -> Result<(), String> {
    let ext = extension_of(&archive.file_name().unwrap_or_default().to_string_lossy());
    match ext.as_str() {
        "zip" => extract_zip(archive, dest),
        "7z" => sevenz_rust::decompress_file(archive, dest).map_err(|e| e.to_string()),
        "rar" => extract_rar(archive, dest),
        other => Err(format!("Unsupported archive .{other}")),
    }
}

fn extract_zip(archive: &Path, dest: &Path) -> Result<(), String> {
    let file = File::open(archive).map_err(|e| e.to_string())?;
    let mut zip = ZipArchive::new(file).map_err(|e| e.to_string())?;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        let Some(rel) = entry.enclosed_name().map(|p| p.to_path_buf()) else {
            continue;
        };
        let out = dest.join(rel);
        if entry.is_dir() {
            fs::create_dir_all(&out).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(parent) = out.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut outfile = File::create(&out).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut outfile).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn extract_rar(archive_path: &Path, dest: &Path) -> Result<(), String> {
    let mut archive = unrar::Archive::new(archive_path)
        .open_for_processing()
        .map_err(|e| e.to_string())?;
    loop {
        let Some(header) = archive.read_header().map_err(|e| e.to_string())? else {
            break;
        };
        archive = header.extract_with_base(dest).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn hash_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 1024 * 64];
    loop {
        let n = file.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn path_within(path: &Path, root: &Path) -> bool {
    let Ok(path) = path.canonicalize() else {
        return false;
    };
    let Ok(root) = root.canonicalize() else {
        return false;
    };
    path.starts_with(root)
}

#[cfg(test)]
mod flow_tests {
    use super::*;
    use crate::db::{open, FolderFilter};
    use crate::rescan::rescan;
    use std::io::Write;
    use zip::write::SimpleFileOptions;
    use zip::ZipWriter;

    fn scratch() -> (PathBuf, PathBuf, PathBuf) {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis();
        let base = std::env::temp_dir().join(format!("3dfl-test-{}-{stamp}", std::process::id()));
        let data = base.join("data");
        let library = base.join("library");
        let incoming = base.join("incoming");
        fs::create_dir_all(&data).unwrap();
        fs::create_dir_all(&library).unwrap();
        fs::create_dir_all(&incoming).unwrap();
        (data, library, incoming)
    }

    #[test]
    fn import_organize_search_rescan_and_recycle() {
        let (data, library, incoming) = scratch();
        let db = open(&data).unwrap();
        assert!(db.settings().library_root.is_none());
        assert_eq!(db.settings().theme, "dark");
        let boot = db.set_library_root(&library).unwrap();
        assert!(db.set_library_root(&library).is_err());
        let names: Vec<_> = boot.folders.iter().map(|f| f.name.as_str()).collect();
        assert_eq!(names, ["FDM Prints", "Models", "Wargaming Terrain"]);
        for folder in &boot.folders {
            assert!(library.join(&folder.relpath).is_dir());
        }
        let models = boot.folders.iter().find(|f| f.name == "Models").unwrap().id;
        let terrain = boot
            .folders
            .iter()
            .find(|f| f.name == "Wargaming Terrain")
            .unwrap()
            .id;

        let first = incoming.join("Throne_of_Baal.stl");
        let second = incoming.join("copy-slot");
        fs::create_dir_all(&second).unwrap();
        let second = second.join("Throne_of_Baal.stl");
        fs::write(&first, b"solid a\nendsolid a\n").unwrap();
        fs::write(&second, b"solid b\nendsolid b\n").unwrap();

        let summary = import_paths(
            &db,
            &[first.to_string_lossy().to_string(), second.to_string_lossy().to_string()],
            Some(models),
            |_| {},
        )
        .unwrap();
        assert_eq!(summary.imported_count, 2);
        assert!(summary.failed.is_empty(), "{:?}", summary.failed);
        assert_eq!(summary.recycle_paths.len(), 2);
        let rows = db
            .list_files(FolderFilter::Id(models), "", "", "", "name")
            .unwrap();
        let stored: Vec<_> = rows.iter().map(|r| r.stored_relpath.clone()).collect();
        assert!(stored.iter().any(|p| p.ends_with("Throne_of_Baal.stl")));
        assert!(stored.iter().any(|p| p.ends_with("Throne_of_Baal (2).stl")));
        assert!(rows.iter().all(|r| r.sort_name == "Throne of Baal"));

        let again = import_paths(&db, &[first.to_string_lossy().to_string()], Some(models), |_| {}).unwrap();
        assert_eq!(again.duplicate_count, 1);
        assert!(again.recycle_paths.is_empty());

        let id = rows[0].id;
        db.update_file(id, "Throne of Baal", "Jason", "keep these notes", Some(models))
            .unwrap();
        db.set_tags(id, &["terrain".into(), "baal".into()]).unwrap();
        let found = db
            .list_files(FolderFilter::All, "thro", "", "", "name")
            .unwrap();
        assert!(found.iter().any(|r| r.id == id));
        let tagged = db
            .list_files(FolderFilter::All, "", "", "baal", "name")
            .unwrap();
        assert_eq!(tagged.len(), 1);

        let zip_path = incoming.join("Citadel.zip");
        {
            let file = File::create(&zip_path).unwrap();
            let mut zip = ZipWriter::new(file);
            zip.start_file("walls/Gate.stl", SimpleFileOptions::default()).unwrap();
            zip.write_all(b"solid gate\nendsolid gate\n").unwrap();
            zip.finish().unwrap();
        }
        let seven = incoming.join("Outpost.7z");
        let seven_src = incoming.join("seven-src");
        fs::create_dir_all(seven_src.join("floors")).unwrap();
        fs::write(seven_src.join("floors").join("Tile.obj"), b"o tile\n").unwrap();
        sevenz_rust::compress_to_path(&seven_src, &seven).unwrap();

        let archived = import_paths(
            &db,
            &[
                zip_path.to_string_lossy().to_string(),
                seven.to_string_lossy().to_string(),
            ],
            None,
            |_| {},
        )
        .unwrap();
        assert!(archived.failed.is_empty(), "{:?}", archived.failed);
        assert_eq!(archived.imported_count, 2);
        assert!(library.join("Citadel").join("walls").join("Gate.stl").is_file());
        assert!(library.join("Outpost").join("floors").join("Tile.obj").is_file());
        assert!(archived.recycle_paths.iter().any(|p| p.ends_with("Citadel.zip")));

        db.move_files(&[id], Some(terrain)).unwrap();
        let moved = db.file_location(id).unwrap();
        assert_eq!(moved.folder_id, Some(terrain));
        assert!(library.join(&moved.stored_relpath).is_file());

        let loose = library.join("FoundOnDisk");
        fs::create_dir_all(&loose).unwrap();
        let relocated_to = loose.join("Throne_of_Baal.stl");
        fs::rename(library.join(&moved.stored_relpath), &relocated_to).unwrap();
        let scan = rescan(&db, |_| {}).unwrap();
        assert!(scan.relocated >= 1);
        assert!(scan.added_folders >= 1);
        let after = db.file_location(id).unwrap();
        assert!(after.stored_relpath.replace('\\', "/").ends_with("FoundOnDisk/Throne_of_Baal.stl"));
        let notes = db
            .list_files(FolderFilter::All, "thro", "Jason", "", "name")
            .unwrap();
        assert!(notes.iter().any(|r| r.id == id && r.notes == "keep these notes"));

        let empty = db.create_folder(Some(models), "Empty Bin", 0).unwrap();
        db.delete_folder(empty.id).unwrap();
        assert!(db.delete_folder(models).is_err());

        let doomed = db.file_location(id).unwrap();
        db.delete_files(&[id]).unwrap();
        assert!(!library.join(&doomed.stored_relpath).exists());
        let failed = recycle_paths(&[first.to_string_lossy().to_string()]).unwrap();
        assert!(failed.is_empty(), "{failed:?}");
        assert!(!first.exists());
        let _ = fs::remove_dir_all(data.parent().unwrap());
    }

    #[test]
    fn folder_import_emits_per_file_progress() {
        let (data, library, incoming) = scratch();
        let db = open(&data).unwrap();
        let boot = db.set_library_root(&library).unwrap();
        let models = boot.folders.iter().find(|f| f.name == "Models").unwrap().id;

        let pack = incoming.join("pack");
        fs::create_dir_all(pack.join("nested")).unwrap();
        fs::write(pack.join("a.stl"), b"solid a\nendsolid a\n").unwrap();
        fs::write(pack.join("nested").join("b.stl"), b"solid b\nendsolid b\n").unwrap();
        fs::write(pack.join("notes.txt"), b"skip").unwrap();

        let mut events: Vec<(u32, u32)> = Vec::new();
        let summary = import_paths(
            &db,
            &[pack.to_string_lossy().to_string()],
            Some(models),
            |p| events.push((p.current, p.total)),
        )
        .unwrap();
        assert_eq!(summary.imported_count, 2);
        assert_eq!(summary.unsupported_count, 1);

        let totals: Vec<u32> = events.iter().map(|(_, t)| *t).collect();
        assert!(
            totals.iter().any(|t| *t == 3),
            "expected total 3 files in folder, got totals {totals:?}"
        );
        let max_current = events.iter().map(|(c, _)| *c).max().unwrap_or(0);
        assert_eq!(max_current, 3, "progress should advance once per file: {events:?}");

        let _ = fs::remove_dir_all(data.parent().unwrap());
    }
}

pub fn recycle_paths(paths: &[String]) -> Result<Vec<String>, String> {
    let mut failed = Vec::new();
    for path in paths {
        let p = PathBuf::from(path);
        if !p.exists() {
            continue;
        }
        if let Err(err) = trash::delete(&p) {
            failed.push(format!("{path}: {err}"));
        }
    }
    Ok(failed)
}
