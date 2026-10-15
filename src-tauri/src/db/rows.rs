pub struct TrashItem {
    pub id: i64,
    pub path: PathBuf,
    pub sha256: String,
    pub name: String,
    pub bytes: u64,
}

pub struct FileLoc {
    pub stored_relpath: String,
    pub folder_id: Option<i64>,
    pub sha256: String,
    pub original_name: String,
}

struct FileSeed {
    id: i64,
    original_name: String,
    sort_name: String,
    stored_relpath: String,
    ext: String,
    size_bytes: i64,
    sha256: String,
    folder_id: Option<i64>,
    creator: String,
    notes: String,
    source_archive: Option<String>,
    imported_at: i64,
    thumb_status: String,
    missing: bool,
}

pub struct ThumbCandidate {
    pub id: i64,
    pub stored_relpath: String,
    pub ext: String,
    pub size_bytes: i64,
    pub sha256: String,
}

pub struct UnhashedCandidate {
    pub id: i64,
    pub stored_relpath: String,
}

pub struct IndexRow {
    pub id: i64,
    pub stored_relpath: String,
    pub sha256: String,
}

pub enum FolderFilter {
    All,
    Root,
    Id(i64),
}

pub fn thumb_path(data_dir: &Path, sha: &str) -> PathBuf {
    data_dir.join("thumbs").join(format!("{sha}.png"))
}

pub fn fts_match(input: &str) -> Option<String> {
    let mut parts = Vec::new();
    for raw in input.split_whitespace() {
        let token: String = raw.chars().filter(|c| c.is_alphanumeric()).collect();
        if token.is_empty() {
            continue;
        }
        parts.push(format!("{token}*"));
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join(" "))
    }
}

fn chrono_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

