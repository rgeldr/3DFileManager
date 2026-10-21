fn import_archive<F: FnMut(ImportProgress)>(
    db: &mut AppDb,
    library_root: &Path,
    folder_cache: &mut FolderCache,
    batch: &mut ImportBatch,
    archive_path: &Path,
    target_folder: Option<i64>,
    parent_rel: &Path,
    depth: u8,
    cancelled: &AtomicBool,
    summary: &mut ImportOutcome,
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
    // The archive folder is created only when a file inside it is stored.
    let prefix = join_rel(parent_rel, Path::new(&stem));
    let imported = import_tree(
        db,
        library_root,
        folder_cache,
        batch,
        &temp,
        target_folder,
        &prefix,
        archive_name.as_deref(),
        depth,
        cancelled,
        summary,
        progress,
    );
    let _ = fs::remove_dir_all(&temp);
    imported?;
    let imported_something =
        summary.imported_count > before_imported || summary.duplicate_count > before_dup;
    // The archive file is the original. Extracted files live in a temp directory
    // and are not listed. A failed extract, or any new failure while importing
    // the contents, leaves the archive where it is.
    if summary.failed.len() == before_failed && imported_something {
        summary
            .recycle_paths
            .push(archive_path.to_string_lossy().to_string());
    }
    Ok(())
}

/// One import may unpack at most this many archive entries.
/// A model pack is far smaller. The cap stops a bomb from creating millions of files.
const MAX_ARCHIVE_ENTRIES: u64 = 100_000;
/// Unpacked bytes across one archive. 64 GiB covers a large model pack.
const MAX_ARCHIVE_BYTES: u64 = 64 * 1024 * 1024 * 1024;

#[derive(Clone, Copy)]
struct ExtractLimits {
    max_entries: u64,
    max_bytes: u64,
}

impl Default for ExtractLimits {
    fn default() -> Self {
        Self {
            max_entries: MAX_ARCHIVE_ENTRIES,
            max_bytes: MAX_ARCHIVE_BYTES,
        }
    }
}

struct ExtractBudget {
    entries: u64,
    bytes: u64,
    limits: ExtractLimits,
}

impl ExtractBudget {
    fn new(limits: ExtractLimits) -> Self {
        Self {
            entries: 0,
            bytes: 0,
            limits,
        }
    }

    fn note_entry(&mut self) -> Result<(), String> {
        if self.entries >= self.limits.max_entries {
            return Err("This archive has too many files to import.".into());
        }
        self.entries += 1;
        Ok(())
    }

    /// Declared size is checked before unpacking so a tiny compressed bomb is refused first.
    fn fits(&self, declared: u64) -> Result<(), String> {
        if declared > 0 && self.bytes.saturating_add(declared) > self.limits.max_bytes {
            return Err("This archive is too large to import.".into());
        }
        Ok(())
    }

    fn note_bytes(&mut self, n: u64) -> Result<(), String> {
        let next = self.bytes.saturating_add(n);
        if next > self.limits.max_bytes {
            return Err("This archive is too large to import.".into());
        }
        self.bytes = next;
        Ok(())
    }
}

fn extract_any(archive: &Path, dest: &Path) -> Result<(), String> {
    extract_any_limited(archive, dest, ExtractLimits::default())
}

fn extract_any_limited(archive: &Path, dest: &Path, limits: ExtractLimits) -> Result<(), String> {
    let ext = extension_of(&archive.file_name().unwrap_or_default().to_string_lossy());
    match ext.as_str() {
        "zip" => extract_zip(archive, dest, limits),
        "7z" => extract_7z(archive, dest, limits),
        "rar" => extract_rar(archive, dest, limits),
        other => Err(format!("Unsupported archive .{other}")),
    }
}

fn extract_zip(archive: &Path, dest: &Path, limits: ExtractLimits) -> Result<(), String> {
    let file = File::open(archive).map_err(|e| e.to_string())?;
    let mut zip = ZipArchive::new(file).map_err(|e| e.to_string())?;
    let mut budget = ExtractBudget::new(limits);
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().to_string();
        let is_dir = entry.is_dir();
        let declared = entry.size();
        write_archive_entry(dest, &name, is_dir, declared, &mut entry, &mut budget)?;
    }
    Ok(())
}

/// Reads each 7z entry itself. `sevenz_rust::decompress_file` joins the entry name onto the
/// destination and will write outside that folder (RUSTSEC-2026-0245).
fn extract_7z(archive: &Path, dest: &Path, limits: ExtractLimits) -> Result<(), String> {
    let mut reader = sevenz_rust::SevenZReader::open(archive, sevenz_rust::Password::empty())
        .map_err(|e| e.to_string())?;
    let mut budget = ExtractBudget::new(limits);
    let mut failure: Option<String> = None;
    reader
        .for_each_entries(|entry, data| {
            if failure.is_some() {
                return Ok(false);
            }
            if let Err(err) = write_archive_entry(
                dest,
                entry.name(),
                entry.is_directory(),
                entry.size(),
                data,
                &mut budget,
            ) {
                failure = Some(err);
                return Ok(false);
            }
            Ok(true)
        })
        .map_err(|e| e.to_string())?;
    match failure {
        Some(err) => Err(err),
        None => Ok(()),
    }
}

fn extract_rar(archive_path: &Path, dest: &Path, limits: ExtractLimits) -> Result<(), String> {
    let mut archive = unrar::Archive::new(archive_path)
        .open_for_processing()
        .map_err(|e| e.to_string())?;
    let mut budget = ExtractBudget::new(limits);
    loop {
        let Some(header) = archive.read_header().map_err(|e| e.to_string())? else {
            break;
        };
        let name = header.entry().filename.to_string_lossy().to_string();
        let unpacked = header.entry().unpacked_size;
        let is_dir = header.entry().is_directory();
        let Some(out) = entry_dest(dest, &name)? else {
            archive = header.skip().map_err(|e| e.to_string())?;
            continue;
        };
        prepare_parent(dest, &out)?;
        budget.note_entry()?;
        if is_dir {
            fs::create_dir_all(&out).map_err(|e| e.to_string())?;
            archive = header.skip().map_err(|e| e.to_string())?;
            continue;
        }
        budget.fits(unpacked)?;
        archive = header.extract_to(&out).map_err(|e| e.to_string())?;
        let meta = fs::symlink_metadata(&out).map_err(|e| e.to_string())?;
        if meta.file_type().is_symlink() {
            let _ = fs::remove_file(&out);
            return Err(leave_msg(&name));
        }
        budget.note_bytes(meta.len())?;
    }
    Ok(())
}

fn write_archive_entry(
    dest: &Path,
    name: &str,
    is_dir: bool,
    declared: u64,
    data: &mut dyn Read,
    budget: &mut ExtractBudget,
) -> Result<(), String> {
    let Some(out) = entry_dest(dest, name)? else {
        // Keep a solid 7z stream aligned when the entry is only ".".
        return discard_capped(data, budget);
    };
    prepare_parent(dest, &out)?;
    budget.note_entry()?;
    if is_dir {
        fs::create_dir_all(&out).map_err(|e| e.to_string())?;
        return discard_capped(data, budget);
    }
    budget.fits(declared)?;
    if out
        .symlink_metadata()
        .map(|meta| meta.file_type().is_symlink())
        .unwrap_or(false)
    {
        return Err(leave_msg(name));
    }
    let mut outfile = File::create(&out).map_err(|e| e.to_string())?;
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = data.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        budget.note_bytes(n as u64)?;
        outfile.write_all(&buf[..n]).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn discard_capped(data: &mut dyn Read, budget: &mut ExtractBudget) -> Result<(), String> {
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = data.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            return Ok(());
        }
        budget.note_bytes(n as u64)?;
    }
}

/// `Some` is a path inside `dest`. `None` is an empty or "." entry, which is the folder itself.
fn entry_dest(dest: &Path, name: &str) -> Result<Option<PathBuf>, String> {
    let normalized = name.replace('\\', "/");
    if normalized.chars().any(|c| c == '\0' || c == ':') || normalized.starts_with('/') {
        return Err(leave_msg(name));
    }
    let rel = Path::new(&normalized);
    if rel.is_absolute() {
        return Err(leave_msg(name));
    }
    let mut parts = Vec::new();
    for component in rel.components() {
        match component {
            Component::Normal(part) => {
                let text = part.to_string_lossy();
                if text == ".." || text.contains('/') || text.contains(':') {
                    return Err(leave_msg(name));
                }
                parts.push(part.to_os_string());
            }
            Component::CurDir => {}
            _ => return Err(leave_msg(name)),
        }
    }
    if parts.is_empty() {
        return Ok(None);
    }
    let mut out = dest.to_path_buf();
    for part in parts {
        out.push(part);
    }
    Ok(Some(out))
}

fn prepare_parent(dest: &Path, out: &Path) -> Result<(), String> {
    let dest_canon = dest.canonicalize().map_err(|e| e.to_string())?;
    let parent = out.parent().unwrap_or(dest);
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let parent_canon = parent.canonicalize().map_err(|e| e.to_string())?;
    if !parent_canon.starts_with(&dest_canon) {
        return Err("Archive entry tries to leave the import folder.".into());
    }
    Ok(())
}

fn leave_msg(name: &str) -> String {
    format!("Archive entry tries to leave the import folder: {name}")
}
