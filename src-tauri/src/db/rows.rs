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
    mtime: i64,
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
    Subtree(i64),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TagMatch {
    Any,
    All,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagCount {
    pub id: i64,
    pub name: String,
    pub file_count: i64,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TypeCount {
    pub id: String,
    pub label: String,
    pub exts: Vec<String>,
    pub file_count: i64,
}

pub struct FileQuery<'a> {
    pub folder: FolderFilter,
    pub query: &'a str,
    pub creator: &'a str,
    pub tag: &'a str,
    pub tag_ids: &'a [i64],
    pub tag_match: TagMatch,
    pub exts: &'a [&'a str],
    pub sort: &'a str,
    pub sort_direction: &'a str,
    pub limit: Option<u32>,
    pub offset: u32,
}

pub fn push_ext_in(sql: &mut String, params: &mut Vec<String>, exts: &[&str]) {
    let mut unique = Vec::new();
    for ext in exts {
        let ext = ext.trim().to_ascii_lowercase();
        if ext.is_empty() || !crate::names::is_supported_file(&ext) || unique.contains(&ext) {
            continue;
        }
        unique.push(ext);
    }
    if unique.is_empty() {
        return;
    }
    let placeholders = unique.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    sql.push_str(&format!(" AND lower(f.ext) IN ({placeholders})"));
    params.extend(unique);
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

