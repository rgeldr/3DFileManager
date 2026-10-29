use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use rusqlite::OptionalExtension;
use sha2::{Digest, Sha256};
use walkdir::WalkDir;
use zip::ZipArchive;

use crate::db::AppDb;
use crate::names::{extension_of, is_archive, is_supported_file, sanitize_component, unique_file_path};

const BATCH_SIZE: u32 = 250;
pub const SUMMARY_ID_CAP: usize = 200;

#[derive(Debug, Clone)]
pub struct ImportOutcome {
    pub imported_ids: Vec<i64>,
    pub imported_count: u32,
    pub duplicate_count: u32,
    pub unsupported_count: u32,
    pub failed: Vec<String>,
    pub recycle_paths: Vec<String>,
    /// Directory imports whose emptied subfolders may be removed after recycle.
    /// The directory itself is never recycled or removed.
    pub recycle_roots: Vec<String>,
    pub cancelled: bool,
    pub pending_hash_count: u32,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    pub imported_ids: Vec<i64>,
    pub imported_count: u32,
    pub duplicate_count: u32,
    pub unsupported_count: u32,
    pub failed: Vec<String>,
    pub recycle_count: u32,
    /// Unsupported files plus files that failed to import. Those stay on disk.
    pub left_in_place: u32,
    pub cancelled: bool,
    pub pending_hash_count: u32,
}

pub fn summary_for_api(outcome: &ImportOutcome) -> ImportSummary {
    ImportSummary {
        imported_ids: if outcome.imported_ids.len() <= SUMMARY_ID_CAP {
            outcome.imported_ids.clone()
        } else {
            Vec::new()
        },
        imported_count: outcome.imported_count,
        duplicate_count: outcome.duplicate_count,
        unsupported_count: outcome.unsupported_count,
        failed: outcome.failed.clone(),
        recycle_count: outcome.recycle_paths.len() as u32,
        left_in_place: outcome.unsupported_count.saturating_add(outcome.failed.len() as u32),
        cancelled: outcome.cancelled,
        pending_hash_count: outcome.pending_hash_count,
    }
}

include!("progress.rs");
include!("plan.rs");
include!("archive.rs");
include!("store.rs");
include!("cleanup.rs");

#[cfg(test)]
mod flow_tests {
    use super::*;
    use crate::db::{open, FolderFilter};
    use crate::hash_pass::drain_unhashed;
    use crate::recycle_and_drop_files;
    use crate::rescan::rescan;
    use std::io::Write;
    use std::sync::atomic::AtomicBool;
    use std::sync::Mutex;
    use zip::write::SimpleFileOptions;
    use zip::ZipWriter;
    include!("flow_tests_support.rs");
    include!("flow_tests_archive.rs");
    include!("flow_tests_plan.rs");
    include!("flow_tests_cleanup.rs");
    include!("flow_tests_store.rs");
    include!("flow_tests_coverage.rs");
}
