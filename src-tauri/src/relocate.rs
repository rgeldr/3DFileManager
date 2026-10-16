use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use serde::Serialize;
use walkdir::WalkDir;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskProgress {
    pub current: u32,
    pub total: u32,
    pub name: String,
    pub bytes_done: u64,
    pub bytes_total: u64,
    pub cancellable: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TreeMove {
    Renamed,
    Copied,
    Cancelled,
}

pub fn move_tree<F: FnMut(DiskProgress)>(
    from: &Path,
    to: &Path,
    cancel: &AtomicBool,
    force_copy: bool,
    mut progress: F,
) -> Result<TreeMove, String> {
    if from == to {
        return Ok(TreeMove::Renamed);
    }
    if !from.exists() {
        return Err(format!("Folder was not found on disk: {}", from.display()));
    }
    if !force_copy {
        match fs::rename(from, to) {
            Ok(()) => return Ok(TreeMove::Renamed),
            Err(err) if crosses_devices(&err) => {}
            Err(err) => return Err(err.to_string()),
        }
    }
    if copy_tree(from, to, cancel, &mut progress)? {
        Ok(TreeMove::Cancelled)
    } else {
        Ok(TreeMove::Copied)
    }
}

/// Moves one file. `Ok(true)` means the move was cancelled and the source is unchanged.
pub fn move_file<F: FnMut(DiskProgress)>(
    from: &Path,
    to: &Path,
    cancel: &AtomicBool,
    bytes_done: &mut u64,
    bytes_total: u64,
    current: u32,
    total: u32,
    mut progress: F,
) -> Result<bool, String> {
    if cancel.load(Ordering::SeqCst) {
        return Ok(true);
    }
    if !from.exists() {
        return Ok(false);
    }
    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let name = file_name(from);
    match fs::rename(from, to) {
        Ok(()) => {
            *bytes_done += to.metadata().map(|m| m.len()).unwrap_or(0);
            progress(DiskProgress {
                current,
                total,
                name,
                bytes_done: *bytes_done,
                bytes_total,
                cancellable: true,
            });
            Ok(false)
        }
        Err(err) if crosses_devices(&err) => {
            if copy_file(from, to, cancel, bytes_done, bytes_total, current, total, &name, &mut progress)? {
                return Ok(true);
            }
            if let Err(err) = fs::remove_file(from) {
                let _ = fs::remove_file(to);
                return Err(err.to_string());
            }
            Ok(false)
        }
        Err(err) => Err(err.to_string()),
    }
}

pub fn copy_tree<F: FnMut(DiskProgress)>(
    from: &Path,
    to: &Path,
    cancel: &AtomicBool,
    progress: &mut F,
) -> Result<bool, String> {
    progress(DiskProgress {
        current: 0,
        total: 0,
        name: "Counting files".into(),
        bytes_done: 0,
        bytes_total: 0,
        cancellable: true,
    });
    let mut dirs = Vec::new();
    let mut files: Vec<(PathBuf, u64)> = Vec::new();
    for entry in WalkDir::new(from).follow_links(false) {
        if cancel.load(Ordering::SeqCst) {
            return Ok(true);
        }
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.path() == from {
            continue;
        }
        let rel = entry.path().strip_prefix(from).map_err(|e| e.to_string())?;
        if entry.file_type().is_dir() {
            dirs.push(rel.to_path_buf());
        } else if entry.file_type().is_file() {
            let len = entry.metadata().map(|meta| meta.len()).unwrap_or(0);
            files.push((rel.to_path_buf(), len));
        }
    }
    let total = files.len() as u32;
    let bytes_total: u64 = files.iter().map(|(_, len)| *len).sum();
    progress(DiskProgress {
        current: 0,
        total,
        name: String::new(),
        bytes_done: 0,
        bytes_total,
        cancellable: true,
    });
    let copy_result = (|| -> Result<bool, String> {
        fs::create_dir_all(to).map_err(|e| e.to_string())?;
        for dir in &dirs {
            if cancel.load(Ordering::SeqCst) {
                return Ok(true);
            }
            fs::create_dir_all(to.join(dir)).map_err(|e| e.to_string())?;
        }
        let mut bytes_done = 0u64;
        for (index, (rel, _)) in files.iter().enumerate() {
            if cancel.load(Ordering::SeqCst) {
                return Ok(true);
            }
            let name = file_name(rel);
            let dest = to.join(rel);
            if let Some(parent) = dest.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let current = index as u32;
            if copy_file(
                &from.join(rel),
                &dest,
                cancel,
                &mut bytes_done,
                bytes_total,
                current,
                total,
                &name,
                progress,
            )? {
                return Ok(true);
            }
            progress(DiskProgress {
                current: current + 1,
                total,
                name,
                bytes_done,
                bytes_total,
                cancellable: true,
            });
        }
        Ok(false)
    })();
    match copy_result {
        Ok(true) => {
            let _ = fs::remove_dir_all(to);
            Ok(true)
        }
        Ok(false) => Ok(false),
        Err(err) => {
            let _ = fs::remove_dir_all(to);
            Err(err)
        }
    }
}

fn copy_file<F: FnMut(DiskProgress)>(
    from: &Path,
    to: &Path,
    cancel: &AtomicBool,
    bytes_done: &mut u64,
    bytes_total: u64,
    current: u32,
    total: u32,
    name: &str,
    progress: &mut F,
) -> Result<bool, String> {
    let mut input = File::open(from).map_err(|e| e.to_string())?;
    let mut output = match File::create(to) {
        Ok(file) => file,
        Err(err) => return Err(err.to_string()),
    };
    let mut buf = vec![0u8; 1024 * 1024];
    let mut last_emit = Instant::now() - Duration::from_secs(1);
    loop {
        if cancel.load(Ordering::SeqCst) {
            drop(output);
            let _ = fs::remove_file(to);
            return Ok(true);
        }
        let read = input.read(&mut buf);
        let n = match read {
            Ok(0) => break,
            Ok(n) => n,
            Err(err) => {
                drop(output);
                let _ = fs::remove_file(to);
                return Err(err.to_string());
            }
        };
        if let Err(err) = output.write_all(&buf[..n]) {
            drop(output);
            let _ = fs::remove_file(to);
            return Err(err.to_string());
        }
        *bytes_done += n as u64;
        if last_emit.elapsed() >= Duration::from_millis(150) {
            last_emit = Instant::now();
            progress(DiskProgress {
                current,
                total,
                name: name.to_string(),
                bytes_done: *bytes_done,
                bytes_total,
                cancellable: true,
            });
        }
    }
    Ok(false)
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| path.display().to_string())
}

fn crosses_devices(err: &std::io::Error) -> bool {
    err.kind() == std::io::ErrorKind::CrossesDevices
        || matches!(err.raw_os_error(), Some(17) | Some(18))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch() -> (PathBuf, PathBuf) {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis();
        let base = std::env::temp_dir().join(format!("3dfl-move-{}-{stamp}", std::process::id()));
        let from = base.join("from");
        fs::create_dir_all(from.join("nested")).unwrap();
        fs::write(from.join("a.stl"), b"aaa").unwrap();
        fs::write(from.join("nested").join("b.stl"), b"bbbb").unwrap();
        (base, from)
    }

    #[test]
    fn same_volume_rename_moves_the_directory() {
        let (base, from) = scratch();
        let to = base.join("to");
        let cancel = AtomicBool::new(false);
        let kind = move_tree(&from, &to, &cancel, false, |_| {}).unwrap();
        assert_eq!(kind, TreeMove::Renamed);
        assert!(!from.exists());
        assert_eq!(fs::read(to.join("nested").join("b.stl")).unwrap(), b"bbbb");
        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn copy_cancel_removes_the_partial_destination() {
        let (base, from) = scratch();
        let to = base.join("to");
        let cancel = AtomicBool::new(false);
        let kind = move_tree(&from, &to, &cancel, true, |progress| {
            if progress.current >= 1 {
                cancel.store(true, Ordering::SeqCst);
            }
        })
        .unwrap();
        assert_eq!(kind, TreeMove::Cancelled);
        assert_eq!(fs::read(from.join("a.stl")).unwrap(), b"aaa");
        assert_eq!(fs::read(from.join("nested").join("b.stl")).unwrap(), b"bbbb");
        assert!(!to.exists());
        let _ = fs::remove_dir_all(base);
    }
}
