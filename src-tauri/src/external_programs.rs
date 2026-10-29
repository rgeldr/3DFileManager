use std::cmp::Ordering;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExternalProgram {
    pub id: String,
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProgramSuggestion {
    pub name: String,
    pub path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProgramLaunch {
    pub program: PathBuf,
    pub arguments: Vec<std::ffi::OsString>,
}

#[derive(Debug, Clone)]
pub struct InstallRoots {
    pub program_files: Option<PathBuf>,
    pub program_files_x86: Option<PathBuf>,
    pub local_app_data: Option<PathBuf>,
}

struct KnownProgram {
    name: &'static str,
    relative: &'static [&'static str],
    prefixes: &'static [&'static str],
    prefix_exes: &'static [&'static str],
}

const KNOWN_PROGRAMS: &[KnownProgram] = &[
    KnownProgram {
        name: "OrcaSlicer",
        relative: &["OrcaSlicer/orca-slicer.exe", "OrcaSlicer/OrcaSlicer.exe"],
        prefixes: &[],
        prefix_exes: &[],
    },
    KnownProgram {
        name: "Bambu Studio",
        relative: &[
            "Bambu Studio/bambu-studio.exe",
            "BambuStudio/bambu-studio.exe",
        ],
        prefixes: &[],
        prefix_exes: &[],
    },
    KnownProgram {
        name: "PrusaSlicer",
        relative: &["Prusa3D/PrusaSlicer/prusa-slicer.exe"],
        prefixes: &[],
        prefix_exes: &[],
    },
    KnownProgram {
        name: "SuperSlicer",
        relative: &["SuperSlicer/superslicer.exe"],
        prefixes: &[],
        prefix_exes: &[],
    },
    KnownProgram {
        name: "UltiMaker Cura",
        relative: &[],
        prefixes: &["UltiMaker Cura", "Ultimaker Cura"],
        prefix_exes: &["UltiMaker-Cura.exe", "Ultimaker-Cura.exe"],
    },
    KnownProgram {
        name: "Lychee Slicer",
        relative: &["LycheeSlicer/LycheeSlicer.exe"],
        prefixes: &[],
        prefix_exes: &[],
    },
    KnownProgram {
        name: "CHITUBOX",
        relative: &[
            "CHITUBOX/CHITUBOX.exe",
            "CBD/CHITUBOX_Basic/CHITUBOX.exe",
            "CBD/CHITUBOX/CHITUBOX.exe",
        ],
        prefixes: &[],
        prefix_exes: &[],
    },
    KnownProgram {
        name: "Elegoo Slicer",
        relative: &["ElegooSlicer/elegoo-slicer.exe"],
        prefixes: &[],
        prefix_exes: &[],
    },
    KnownProgram {
        name: "ideaMaker",
        relative: &["Raise3D/ideaMaker/ideaMaker.exe"],
        prefixes: &[],
        prefix_exes: &[],
    },
];

pub fn install_roots_from_env() -> InstallRoots {
    InstallRoots {
        program_files: env_path("ProgramFiles"),
        program_files_x86: env_path("ProgramFiles(x86)"),
        local_app_data: env_path("LOCALAPPDATA"),
    }
}

pub fn detect_installed_programs() -> Vec<ProgramSuggestion> {
    detect_programs(&install_roots_from_env())
}

fn env_path(key: &str) -> Option<PathBuf> {
    std::env::var_os(key)
        .map(PathBuf::from)
        .filter(|path| !path.as_os_str().is_empty())
}

pub fn normalize_external_programs(
    programs: Vec<ExternalProgram>,
) -> Result<Vec<ExternalProgram>, String> {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::with_capacity(programs.len());
    for program in programs {
        let id = program.id.trim().to_string();
        let name = program.name.trim().to_string();
        let path = normalize_saved_program_path(program.path.trim());
        if id.is_empty()
            || id.len() > 64
            || !id
                .chars()
                .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
        {
            return Err("That program id is not valid.".into());
        }
        if !seen.insert(id.clone()) {
            return Err("Two programs use the same id.".into());
        }
        if name.is_empty() || name.len() > 80 || name.chars().any(|ch| ch.is_control()) {
            return Err("Enter a name for the program.".into());
        }
        if path.is_empty()
            || path.len() > 1024
            || path.contains('\0')
            || !is_exe(&path)
            || !is_absolute_program_path(&path)
        {
            return Err("Choose the full path to an .exe file.".into());
        }
        out.push(ExternalProgram { id, name, path });
    }
    Ok(out)
}

fn is_exe(path: &str) -> bool {
    Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("exe"))
}

/// Absolute on this operating system, or a Windows drive or UNC path.
/// Linux tests use the Windows form so the same rule covers Jason's paths.
fn is_absolute_program_path(path: &str) -> bool {
    if Path::new(path).is_absolute() {
        return true;
    }
    let bytes = path.as_bytes();
    if bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && (bytes[2] == b'\\' || bytes[2] == b'/')
    {
        return true;
    }
    path.starts_with(r"\\")
}

/// The executable is the one stored for `program_id`. The file path is a single argument.
pub fn launch_for_program(
    programs: &[ExternalProgram],
    program_id: &str,
    file_path: &Path,
) -> Result<ProgramLaunch, String> {
    let program = programs
        .iter()
        .find(|item| item.id == program_id)
        .ok_or_else(|| "That program is no longer in External programs.".to_string())?;
    let exe = PathBuf::from(&program.path);
    if !exe.is_file() {
        return Err(format!(
            "Can't find {}. It is not at {}.",
            program.name, program.path
        ));
    }
    let argument = file_path.as_os_str().to_os_string();
    if argument.is_empty() {
        return Err("That file path is empty.".into());
    }
    Ok(ProgramLaunch {
        program: exe,
        arguments: vec![argument],
    })
}

/// `Command::new` plus `args`. This does not build a shell command line.
pub fn command_for(launch: &ProgramLaunch) -> Command {
    let mut command = Command::new(&launch.program);
    command.args(&launch.arguments);
    command
}

pub fn spawn_launch(launch: &ProgramLaunch) -> Result<(), String> {
    let mut child = command_for(launch)
        .spawn()
        .map_err(|err| format!("Couldn't start {}. {err}", launch.program.display()))?;
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

pub fn detect_programs(roots: &InstallRoots) -> Vec<ProgramSuggestion> {
    let bases = search_bases(roots);
    KNOWN_PROGRAMS
        .iter()
        .map(|known| ProgramSuggestion {
            name: known.name.to_string(),
            path: find_known(known, &bases).map(|path| path.to_string_lossy().to_string()),
        })
        .collect()
}

fn search_bases(roots: &InstallRoots) -> Vec<PathBuf> {
    let mut bases = Vec::new();
    if let Some(path) = &roots.program_files {
        bases.push(path.clone());
    }
    if let Some(path) = &roots.program_files_x86 {
        bases.push(path.clone());
    }
    if let Some(path) = &roots.local_app_data {
        bases.push(join_program_path(path, "Programs"));
    }
    bases
}

fn windows_style_path(path: &str) -> bool {
    let bytes = path.as_bytes();
    if bytes.len() >= 2 && (bytes[0] == b'\\' || bytes[0] == b'/') && bytes[1] == bytes[0] {
        return true;
    }
    bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':'
}

/// Drive and UNC paths always use `\`, including a relative piece that was written with `/`.
fn normalize_windows_separators(path: &str) -> String {
    let unc = {
        let bytes = path.as_bytes();
        bytes.len() >= 2 && (bytes[0] == b'\\' || bytes[0] == b'/') && bytes[1] == bytes[0]
    };
    let slashed: String = path
        .chars()
        .map(|ch| if ch == '/' { '\\' } else { ch })
        .collect();
    if unc {
        format!(
            "\\\\{}",
            collapse_backslashes(slashed.trim_start_matches('\\'))
        )
    } else {
        collapse_backslashes(&slashed)
    }
}

fn collapse_backslashes(path: &str) -> String {
    let mut out = String::with_capacity(path.len());
    let mut prev_slash = false;
    for ch in path.chars() {
        if ch == '\\' {
            if !prev_slash {
                out.push('\\');
            }
            prev_slash = true;
        } else {
            prev_slash = false;
            out.push(ch);
        }
    }
    out
}

fn normalize_saved_program_path(path: &str) -> String {
    if windows_style_path(path) {
        normalize_windows_separators(path)
    } else {
        path.to_string()
    }
}

fn join_program_path(root: &Path, relative: &str) -> PathBuf {
    let root_text = root.as_os_str().to_string_lossy();
    if windows_style_path(&root_text) {
        let mut path = normalize_windows_separators(&root_text);
        for part in relative.split(['/', '\\']) {
            if part.is_empty() || part == "." {
                continue;
            }
            if !path.ends_with('\\') {
                path.push('\\');
            }
            path.push_str(part);
        }
        return PathBuf::from(path);
    }
    let mut path = root.to_path_buf();
    for part in relative.split(['/', '\\']) {
        if part.is_empty() || part == "." {
            continue;
        }
        path.push(part);
    }
    path
}

fn find_known(known: &KnownProgram, bases: &[PathBuf]) -> Option<PathBuf> {
    for base in bases {
        for relative in known.relative {
            let candidate = join_program_path(base, relative);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
        if let Some(found) = find_prefixed(base, known.prefixes, known.prefix_exes) {
            return Some(found);
        }
    }
    None
}

fn find_prefixed(root: &Path, prefixes: &[&str], exes: &[&str]) -> Option<PathBuf> {
    if prefixes.is_empty() || exes.is_empty() {
        return None;
    }
    let mut names = fs::read_dir(root)
        .ok()?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            if !entry.file_type().ok()?.is_dir() {
                return None;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            let lower = name.to_lowercase();
            if prefixes
                .iter()
                .any(|prefix| lower.starts_with(&prefix.to_lowercase()))
            {
                Some(name)
            } else {
                None
            }
        })
        .collect::<Vec<_>>();
    names.sort_by(|a, b| cmp_version(a, b));
    for name in names.iter().rev() {
        for exe in exes {
            let candidate = join_program_path(&join_program_path(root, name), exe);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

fn version_key(name: &str) -> Vec<u32> {
    name.split(|ch: char| !ch.is_ascii_digit() && ch != '.')
        .filter(|part| !part.is_empty())
        .flat_map(|part| part.split('.'))
        .filter_map(|number| number.parse().ok())
        .collect()
}

fn cmp_version(a: &str, b: &str) -> Ordering {
    version_key(a).cmp(&version_key(b)).then_with(|| a.cmp(b))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn program(id: &str, name: &str, path: &str) -> ExternalProgram {
        ExternalProgram {
            id: id.into(),
            name: name.into(),
            path: path.into(),
        }
    }

    #[test]
    fn detected_windows_paths_use_backslashes_only() {
        let roots = [
            Path::new(r"C:\Program Files"),
            Path::new(r"C:\Program Files (x86)"),
            Path::new(r"\\server\share"),
        ];
        for root in roots {
            for known in KNOWN_PROGRAMS {
                for relative in known.relative {
                    let text = join_program_path(root, relative)
                        .to_string_lossy()
                        .into_owned();
                    assert!(
                        !text.contains('/'),
                        "{} from {} -> {text}",
                        known.name,
                        root.display()
                    );
                    assert!(
                        text.starts_with(&root.to_string_lossy().to_string()),
                        "{text}"
                    );
                }
                if !known.prefix_exes.is_empty() {
                    let text = join_program_path(root, "UltiMaker Cura 5.10/UltiMaker-Cura.exe")
                        .to_string_lossy()
                        .into_owned();
                    assert!(!text.contains('/'), "{text}");
                    assert!(
                        text.ends_with(r"\UltiMaker Cura 5.10\UltiMaker-Cura.exe"),
                        "{text}"
                    );
                }
            }
        }
        let local = join_program_path(Path::new(r"C:\Users\Jason\AppData\Local"), "Programs");
        let text = local.to_string_lossy();
        assert!(!text.contains('/'), "{text}");
        assert_eq!(text, r"C:\Users\Jason\AppData\Local\Programs");
    }

    #[test]
    fn normalize_trims_and_keeps_order() {
        let saved = normalize_external_programs(vec![
            program(
                " bambu ",
                " Bambu Studio ",
                r"  C:\Program Files\Bambu Studio\bambu-studio.exe  ",
            ),
            program(
                "orca",
                "OrcaSlicer",
                r"C:\Program Files\OrcaSlicer\orca-slicer.exe",
            ),
        ])
        .unwrap();
        assert_eq!(saved[0].id, "bambu");
        assert_eq!(saved[0].name, "Bambu Studio");
        assert_eq!(
            saved[0].path,
            r"C:\Program Files\Bambu Studio\bambu-studio.exe"
        );
        assert_eq!(saved[1].name, "OrcaSlicer");
    }

    #[test]
    fn normalize_rejects_blank_relative_and_non_exe_paths() {
        assert!(normalize_external_programs(vec![program("a", " ", r"C:\App\app.exe")]).is_err());
        assert!(normalize_external_programs(vec![program("a", "Orca", "   ")]).is_err());
        assert!(
            normalize_external_programs(vec![program("a", "Orca", "orca-slicer.exe")]).is_err()
        );
        assert!(normalize_external_programs(vec![program(
            "a",
            "Orca",
            r"C:\Program Files\OrcaSlicer\run.bat"
        )])
        .is_err());
        assert!(normalize_external_programs(vec![program(
            "a",
            "Orca",
            "C:\\Program Files\\OrcaSlicer\\orca-slicer.exe\0"
        )])
        .is_err());
        let dup = normalize_external_programs(vec![
            program("same", "One", r"C:\One\one.exe"),
            program("same", "Two", r"C:\Two\two.exe"),
        ]);
        assert!(dup.unwrap_err().contains("same id"));
    }

    #[test]
    fn launch_passes_one_argument_and_only_the_configured_executable() {
        let dir = std::env::temp_dir().join(format!("filelib-launch-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let orca = dir.join("orca slicer.exe");
        let bambu = dir.join("bambu-studio.exe");
        let model = dir.join("ベンチ cube.stl");
        fs::write(&orca, b"").unwrap();
        fs::write(&bambu, b"").unwrap();
        fs::write(&model, b"solid").unwrap();
        let programs = vec![
            program("orca", "OrcaSlicer", &orca.to_string_lossy()),
            program("bambu", "Bambu Studio", &bambu.to_string_lossy()),
        ];

        let launch = launch_for_program(&programs, "orca", &model).unwrap();
        let command = command_for(&launch);
        assert_eq!(command.get_program(), orca.as_os_str());
        let args: Vec<_> = command.get_args().collect();
        assert_eq!(args, vec![model.as_os_str()]);
        assert_ne!(command.get_program(), "sh");
        assert_ne!(command.get_program(), "cmd.exe");

        let missing = dir.join("missing.exe");
        let broken = vec![program("gone", "OrcaSlicer", &missing.to_string_lossy())];
        let err = launch_for_program(&broken, "gone", &model).unwrap_err();
        assert!(err.contains("Can't find OrcaSlicer"));
        assert!(err.contains("missing.exe"));
        assert!(launch_for_program(&programs, "nope", &model)
            .unwrap_err()
            .contains("no longer"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[cfg(unix)]
    #[test]
    fn spawn_delivers_a_spaced_non_ascii_path_without_a_shell() {
        let dir = std::env::temp_dir().join(format!("filelib-spawn-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let exe = dir.join("orca slicer.exe");
        let log = dir.join("launched.txt");
        fs::write(
            &exe,
            "#!/bin/sh\nprintf '%s\\n' \"$0\" \"$@\" > \"$LAUNCH_LOG\"\n",
        )
        .unwrap();
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&exe, fs::Permissions::from_mode(0o755)).unwrap();
        let argument = "C:\\Models\\My Cube ベンチ.stl";
        let launch = ProgramLaunch {
            program: exe.clone(),
            arguments: vec![argument.into()],
        };
        let mut command = command_for(&launch);
        command.env("LAUNCH_LOG", &log);
        let status = command.status().unwrap();
        assert!(status.success());
        let text = fs::read_to_string(&log).unwrap();
        let mut lines = text.lines();
        let argv0 = lines.next().unwrap();
        assert!(argv0.contains("orca slicer.exe"));
        assert!(!argv0.ends_with("/sh") && !argv0.ends_with("\\sh"));
        assert_eq!(lines.next().unwrap(), argument);
        assert!(lines.next().is_none());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn detect_finds_known_installs_and_leaves_the_rest_unset() {
        let dir = std::env::temp_dir().join(format!("filelib-detect-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let program_files = dir.join("Program Files");
        let local = dir.join("Local");
        fs::create_dir_all(program_files.join("OrcaSlicer")).unwrap();
        fs::write(
            program_files.join("OrcaSlicer").join("orca-slicer.exe"),
            b"",
        )
        .unwrap();
        fs::create_dir_all(program_files.join("Prusa3D").join("PrusaSlicer")).unwrap();
        fs::write(
            program_files
                .join("Prusa3D")
                .join("PrusaSlicer")
                .join("prusa-slicer.exe"),
            b"",
        )
        .unwrap();
        fs::create_dir_all(program_files.join("UltiMaker Cura 5.9")).unwrap();
        fs::write(
            program_files
                .join("UltiMaker Cura 5.9")
                .join("UltiMaker-Cura.exe"),
            b"",
        )
        .unwrap();
        fs::create_dir_all(program_files.join("UltiMaker Cura 5.10")).unwrap();
        fs::write(
            program_files
                .join("UltiMaker Cura 5.10")
                .join("UltiMaker-Cura.exe"),
            b"",
        )
        .unwrap();
        fs::create_dir_all(local.join("Programs").join("Bambu Studio")).unwrap();
        fs::write(
            local
                .join("Programs")
                .join("Bambu Studio")
                .join("bambu-studio.exe"),
            b"",
        )
        .unwrap();
        fs::create_dir_all(program_files.join("NotASlicer")).unwrap();
        fs::write(program_files.join("NotASlicer").join("other.exe"), b"").unwrap();

        let found = detect_programs(&InstallRoots {
            program_files: Some(program_files.clone()),
            program_files_x86: None,
            local_app_data: Some(local),
        });
        let path_of = |name: &str| {
            found
                .iter()
                .find(|item| item.name == name)
                .and_then(|item| item.path.clone())
        };
        assert!(path_of("OrcaSlicer").unwrap().ends_with("orca-slicer.exe"));
        assert!(path_of("Bambu Studio")
            .unwrap()
            .ends_with("bambu-studio.exe"));
        assert!(path_of("PrusaSlicer").unwrap().contains("Prusa3D"));
        assert!(path_of("UltiMaker Cura").unwrap().contains("5.10"));
        assert_eq!(path_of("SuperSlicer"), None);
        assert_eq!(path_of("Lychee Slicer"), None);
        assert!(found.iter().all(|item| item.name != "NotASlicer"));
        assert_eq!(found.len(), KNOWN_PROGRAMS.len());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn normalize_rewrites_mixed_separators_on_drive_and_unc_paths() {
        let saved = normalize_external_programs(vec![
            program(
                "chitu",
                "CHITUBOX",
                r"C:\Program Files\CHITUBOX/CHITUBOX.exe",
            ),
            program(
                "orca",
                "OrcaSlicer",
                "C:/Program Files/OrcaSlicer/orca-slicer.exe",
            ),
            program("share", "Share", r"\\server\share/Orca/orca-slicer.exe"),
            program("unc", "UNC", "//server/share/app.exe"),
            program(
                "double",
                "Orca",
                "C://Program Files//OrcaSlicer/orca-slicer.exe",
            ),
            program("unix", "Local", "/tmp/orca-slicer.exe"),
        ])
        .unwrap();
        assert_eq!(saved[0].path, r"C:\Program Files\CHITUBOX\CHITUBOX.exe");
        assert_eq!(
            saved[1].path,
            r"C:\Program Files\OrcaSlicer\orca-slicer.exe"
        );
        assert_eq!(saved[2].path, r"\\server\share\Orca\orca-slicer.exe");
        assert_eq!(saved[3].path, r"\\server\share\app.exe");
        assert_eq!(
            saved[4].path,
            r"C:\Program Files\OrcaSlicer\orca-slicer.exe"
        );
        assert_eq!(saved[5].path, "/tmp/orca-slicer.exe");
        assert!(saved
            .iter()
            .take(5)
            .all(|program| !program.path.contains('/')));
    }

    #[test]
    fn normalize_accepts_exe_case_unc_and_drive_paths_and_rejects_limits() {
        let saved = normalize_external_programs(vec![
            program("ok_id-1", "Orca", r"\\server\share\OrcaSlicer.EXE"),
            program("drive", "Prusa", "D:/Tools/prusa-slicer.exe"),
        ])
        .unwrap();
        assert_eq!(saved[0].path, r"\\server\share\OrcaSlicer.EXE");
        assert_eq!(saved[1].path, r"D:\Tools\prusa-slicer.exe");
        assert!(normalize_external_programs(vec![]).unwrap().is_empty());

        let long_id = "a".repeat(65);
        assert!(
            normalize_external_programs(vec![program(&long_id, "Orca", r"C:\a.exe")])
                .unwrap_err()
                .contains("id")
        );
        assert!(normalize_external_programs(vec![program("bad id", "Orca", r"C:\a.exe")]).is_err());
        assert!(normalize_external_programs(vec![program("", "Orca", r"C:\a.exe")]).is_err());
        assert!(
            normalize_external_programs(vec![program("a", &"n".repeat(81), r"C:\a.exe")]).is_err()
        );
        assert!(
            normalize_external_programs(vec![program("a", "Orca\nSlicer", r"C:\a.exe")]).is_err()
        );

        let exact = format!(r"C:\{}.exe", "a".repeat(1024 - 7));
        assert_eq!(exact.len(), 1024);
        assert!(normalize_external_programs(vec![program("a", "Orca", &exact)]).is_ok());
        let too_long = format!(r"C:\{}.exe", "a".repeat(1025 - 7));
        assert!(normalize_external_programs(vec![program("a", "Orca", &too_long)]).is_err());
        assert!(
            normalize_external_programs(vec![program("a", "Orca", r"C:\Tools\run.cmd")]).is_err()
        );
        assert!(normalize_external_programs(vec![program("a", "Orca", r"..\app.exe")]).is_err());
    }

    #[test]
    fn launch_reports_a_missing_normalized_windows_executable() {
        let programs = normalize_external_programs(vec![
            program(
                "chitu",
                "CHITUBOX",
                r"C:\Program Files\CHITUBOX/CHITUBOX.exe",
            ),
            program(
                "unc",
                "OrcaSlicer",
                "//server/share/OrcaSlicer/orca-slicer.exe",
            ),
        ])
        .unwrap();
        let model = Path::new(r"C:\Models\My Cube.stl");
        let missing = launch_for_program(&programs, "chitu", model).unwrap_err();
        assert!(missing.contains(r"C:\Program Files\CHITUBOX\CHITUBOX.exe"));
        assert!(!missing.contains('/'));
        let unc = launch_for_program(&programs, "unc", model).unwrap_err();
        assert!(unc.contains(r"\\server\share\OrcaSlicer\orca-slicer.exe"));
        assert!(!unc.contains('/'));

        let launch = ProgramLaunch {
            program: PathBuf::from(&programs[1].path),
            arguments: vec![model.as_os_str().to_os_string()],
        };
        let command = command_for(&launch);
        assert_eq!(
            command.get_program().to_string_lossy(),
            r"\\server\share\OrcaSlicer\orca-slicer.exe"
        );
        let args: Vec<_> = command
            .get_args()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect();
        assert_eq!(args, vec![r"C:\Models\My Cube.stl"]);
    }

    #[test]
    fn launch_rejects_an_empty_file_path_and_spawn_reports_a_missing_executable() {
        let dir = std::env::temp_dir().join(format!("filelib-launch-empty-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let exe = dir.join("orca-slicer.exe");
        fs::write(&exe, b"").unwrap();
        let programs = vec![program("orca", "OrcaSlicer", &exe.to_string_lossy())];
        let err = launch_for_program(&programs, "orca", Path::new("")).unwrap_err();
        assert!(err.contains("empty"));

        let missing = dir.join("missing.exe");
        let failed = spawn_launch(&ProgramLaunch {
            program: missing.clone(),
            arguments: vec!["C:\\Models\\cube.stl".into()],
        })
        .unwrap_err();
        assert!(failed.contains("Couldn't start"));
        assert!(failed.contains("missing.exe"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[cfg(unix)]
    #[test]
    fn spawn_launch_starts_the_executable_with_one_argument() {
        let dir = std::env::temp_dir().join(format!("filelib-spawn-fn-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let exe = dir.join("bambu studio.exe");
        let log = dir.join("launched.txt");
        fs::write(
            &exe,
            format!(
                "#!/bin/sh\nprintf '%s\\n' \"$0\" \"$@\" > '{}'\n",
                log.display()
            ),
        )
        .unwrap();
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&exe, fs::Permissions::from_mode(0o755)).unwrap();
        let argument = "D:\\Models\\benchy cube.stl";
        spawn_launch(&ProgramLaunch {
            program: exe,
            arguments: vec![argument.into()],
        })
        .unwrap();
        let text = wait_for_file(&log);
        let mut lines = text.lines();
        assert!(lines.next().unwrap().contains("bambu studio.exe"));
        assert_eq!(lines.next().unwrap(), argument);
        assert!(lines.next().is_none());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn detect_reads_later_paths_x86_and_skips_an_empty_newer_cura_folder() {
        let dir = std::env::temp_dir().join(format!("filelib-detect-more-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let program_files = dir.join("Program Files");
        let x86 = dir.join("Program Files (x86)");
        fs::create_dir_all(x86.join("OrcaSlicer")).unwrap();
        fs::write(x86.join("OrcaSlicer").join("OrcaSlicer.exe"), b"").unwrap();
        fs::create_dir_all(x86.join("BambuStudio")).unwrap();
        fs::write(x86.join("BambuStudio").join("bambu-studio.exe"), b"").unwrap();
        fs::create_dir_all(program_files.join("SuperSlicer")).unwrap();
        fs::write(
            program_files.join("SuperSlicer").join("superslicer.exe"),
            b"",
        )
        .unwrap();
        fs::create_dir_all(program_files.join("LycheeSlicer")).unwrap();
        fs::write(
            program_files.join("LycheeSlicer").join("LycheeSlicer.exe"),
            b"",
        )
        .unwrap();
        fs::create_dir_all(program_files.join("CBD").join("CHITUBOX_Basic")).unwrap();
        fs::write(
            program_files
                .join("CBD")
                .join("CHITUBOX_Basic")
                .join("CHITUBOX.exe"),
            b"",
        )
        .unwrap();
        fs::create_dir_all(program_files.join("ElegooSlicer")).unwrap();
        fs::write(
            program_files.join("ElegooSlicer").join("elegoo-slicer.exe"),
            b"",
        )
        .unwrap();
        fs::create_dir_all(program_files.join("Raise3D").join("ideaMaker")).unwrap();
        fs::write(
            program_files
                .join("Raise3D")
                .join("ideaMaker")
                .join("ideaMaker.exe"),
            b"",
        )
        .unwrap();
        fs::create_dir_all(program_files.join("UltiMaker Cura 5.11")).unwrap();
        fs::create_dir_all(program_files.join("ultimaker cura 5.9")).unwrap();
        fs::write(
            program_files
                .join("ultimaker cura 5.9")
                .join("Ultimaker-Cura.exe"),
            b"",
        )
        .unwrap();
        fs::create_dir_all(program_files.join("OrcaSlicer")).unwrap();
        fs::write(program_files.join("OrcaSlicer").join("not-the-exe"), b"").unwrap();

        let found = detect_programs(&InstallRoots {
            program_files: Some(program_files),
            program_files_x86: Some(x86.clone()),
            local_app_data: None,
        });
        let path_of = |name: &str| {
            found
                .iter()
                .find(|item| item.name == name)
                .and_then(|item| item.path.clone())
                .unwrap_or_default()
        };
        assert!(path_of("OrcaSlicer").contains("Program Files (x86)"));
        assert!(path_of("OrcaSlicer").ends_with("OrcaSlicer.exe"));
        assert!(path_of("Bambu Studio").contains("BambuStudio"));
        assert!(path_of("SuperSlicer").ends_with("superslicer.exe"));
        assert!(path_of("Lychee Slicer").ends_with("LycheeSlicer.exe"));
        assert!(path_of("CHITUBOX").contains("CHITUBOX_Basic"));
        assert!(path_of("Elegoo Slicer").ends_with("elegoo-slicer.exe"));
        assert!(path_of("ideaMaker").ends_with("ideaMaker.exe"));
        assert!(path_of("UltiMaker Cura").contains("5.9"));
        assert!(path_of("PrusaSlicer").is_empty());

        let none = detect_programs(&InstallRoots {
            program_files: Some(dir.join("missing")),
            program_files_x86: None,
            local_app_data: None,
        });
        assert_eq!(none.len(), KNOWN_PROGRAMS.len());
        assert!(none.iter().all(|item| item.path.is_none()));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn detect_prefers_program_files_over_x86_and_the_first_relative_path() {
        let dir = std::env::temp_dir().join(format!("filelib-detect-order-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let program_files = dir.join("Program Files");
        let x86 = dir.join("x86");
        fs::create_dir_all(program_files.join("CHITUBOX")).unwrap();
        fs::write(program_files.join("CHITUBOX").join("CHITUBOX.exe"), b"").unwrap();
        fs::create_dir_all(x86.join("CHITUBOX")).unwrap();
        fs::write(x86.join("CHITUBOX").join("CHITUBOX.exe"), b"").unwrap();
        fs::create_dir_all(program_files.join("OrcaSlicer")).unwrap();
        fs::write(
            program_files.join("OrcaSlicer").join("orca-slicer.exe"),
            b"",
        )
        .unwrap();
        fs::write(program_files.join("OrcaSlicer").join("OrcaSlicer.exe"), b"").unwrap();

        let found = detect_programs(&InstallRoots {
            program_files: Some(program_files),
            program_files_x86: Some(x86),
            local_app_data: None,
        });
        let chitu = found.iter().find(|item| item.name == "CHITUBOX").unwrap();
        assert!(chitu.path.as_deref().unwrap().contains("Program Files"));
        assert!(!chitu.path.as_deref().unwrap().contains("x86"));
        let orca = found.iter().find(|item| item.name == "OrcaSlicer").unwrap();
        assert!(orca.path.as_deref().unwrap().ends_with("orca-slicer.exe"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn install_roots_follow_the_environment_and_ignore_empty_values() {
        let dir = std::env::temp_dir().join(format!("filelib-roots-{}", std::process::id()));
        let saved = ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"]
            .map(|key| (key.to_string(), std::env::var_os(key)));
        unsafe {
            std::env::set_var("ProgramFiles", dir.join("pf"));
            std::env::set_var("ProgramFiles(x86)", dir.join("x86"));
            std::env::set_var("LOCALAPPDATA", dir.join("local"));
        }
        let roots = install_roots_from_env();
        assert_eq!(roots.program_files.unwrap(), dir.join("pf"));
        assert_eq!(roots.program_files_x86.unwrap(), dir.join("x86"));
        assert_eq!(roots.local_app_data.unwrap(), dir.join("local"));
        let found = detect_installed_programs();
        assert_eq!(found.len(), KNOWN_PROGRAMS.len());

        unsafe {
            std::env::set_var("ProgramFiles", "");
            std::env::set_var("ProgramFiles(x86)", "");
            std::env::set_var("LOCALAPPDATA", "");
        }
        let empty = install_roots_from_env();
        assert!(empty.program_files.is_none());
        assert!(empty.program_files_x86.is_none());
        assert!(empty.local_app_data.is_none());

        for (key, value) in saved {
            unsafe {
                match value {
                    Some(value) => std::env::set_var(&key, value),
                    None => std::env::remove_var(&key),
                }
            }
        }
    }

    #[test]
    fn path_helpers_normalize_windows_paths_and_pick_the_newest_prefixed_install() {
        assert!(is_exe(r"C:\App\orca-slicer.EXE"));
        assert!(is_exe("C:/App/orca-slicer.exe"));
        assert!(!is_exe(r"C:\App\run.bat"));
        assert!(!is_exe("noext"));
        assert!(is_absolute_program_path(r"C:\App\a.exe"));
        assert!(is_absolute_program_path("C:/App/a.exe"));
        assert!(is_absolute_program_path(r"\\server\share\a.exe"));
        assert!(!is_absolute_program_path("orca-slicer.exe"));
        assert!(!is_absolute_program_path(r"Program Files\a.exe"));
        if cfg!(unix) {
            assert!(is_absolute_program_path("/usr/bin/orca"));
        }
        assert!(windows_style_path(r"C:\App"));
        assert!(windows_style_path("C:"));
        assert!(windows_style_path(r"\\server\share"));
        assert!(windows_style_path("//server/share"));
        assert!(!windows_style_path("/usr/bin/orca"));
        assert!(!windows_style_path("relative.exe"));
        assert_eq!(
            normalize_windows_separators("C:/Program Files//Orca/orca.exe"),
            r"C:\Program Files\Orca\orca.exe"
        );
        assert_eq!(
            normalize_windows_separators("//server//share/app.exe"),
            r"\\server\share\app.exe"
        );
        assert_eq!(collapse_backslashes(r"C:\\Program\\orca.exe"), r"C:\Program\orca.exe");
        assert_eq!(
            normalize_saved_program_path("C:/Program Files/Orca/orca.exe"),
            r"C:\Program Files\Orca\orca.exe"
        );
        assert_eq!(normalize_saved_program_path("/usr/bin/orca"), "/usr/bin/orca");

        unsafe {
            std::env::set_var("FILELIB_TEST_ENV_PATH", "/tmp/filelib-prog");
            std::env::set_var("FILELIB_TEST_ENV_PATH_EMPTY", "");
        }
        assert_eq!(
            env_path("FILELIB_TEST_ENV_PATH").unwrap(),
            PathBuf::from("/tmp/filelib-prog")
        );
        assert!(env_path("FILELIB_TEST_ENV_PATH_EMPTY").is_none());
        assert!(env_path("FILELIB_TEST_ENV_PATH_MISSING").is_none());
        unsafe {
            std::env::remove_var("FILELIB_TEST_ENV_PATH");
            std::env::remove_var("FILELIB_TEST_ENV_PATH_EMPTY");
        }

        assert_eq!(version_key("UltiMaker Cura 5.10"), vec![5, 10]);
        assert_eq!(version_key("Cura 4"), vec![4]);
        assert!(version_key("OrcaSlicer").is_empty());
        assert_eq!(cmp_version("Cura 5.2", "Cura 5.10"), Ordering::Less);
        assert_eq!(cmp_version("Cura 5.10", "Cura 5.2"), Ordering::Greater);
        assert_eq!(cmp_version("Cura 5", "Cura 5"), Ordering::Equal);
        assert_eq!(cmp_version("A 1", "B 1"), Ordering::Less);

        let dir = std::env::temp_dir().join(format!("filelib-prefix-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let cura_new = dir.join("UltiMaker Cura 9.0");
        let cura_510 = dir.join("UltiMaker Cura 5.10");
        let cura_49 = dir.join("UltiMaker Cura 4.9");
        fs::create_dir_all(&cura_new).unwrap();
        fs::create_dir_all(&cura_510).unwrap();
        fs::create_dir_all(&cura_49).unwrap();
        fs::write(cura_510.join("UltiMaker-Cura.exe"), b"").unwrap();
        fs::write(cura_49.join("UltiMaker-Cura.exe"), b"").unwrap();
        let found = find_prefixed(&dir, &["UltiMaker Cura"], &["UltiMaker-Cura.exe"]).unwrap();
        assert_eq!(found, cura_510.join("UltiMaker-Cura.exe"));
        assert!(find_prefixed(&dir, &[], &["UltiMaker-Cura.exe"]).is_none());
        assert!(find_prefixed(Path::new("/tmp/filelib-no-such-program-root"), &["Cura"], &["Cura.exe"]).is_none());

        let known = KnownProgram {
            name: "UltiMaker Cura",
            relative: &[],
            prefixes: &["UltiMaker Cura"],
            prefix_exes: &["UltiMaker-Cura.exe"],
        };
        assert_eq!(find_known(&known, &[dir.clone()]).unwrap(), found);
        fs::create_dir_all(dir.join("OrcaSlicer")).unwrap();
        fs::write(dir.join("OrcaSlicer").join("orca-slicer.exe"), b"").unwrap();
        let orca = KnownProgram {
            name: "OrcaSlicer",
            relative: &["OrcaSlicer/orca-slicer.exe"],
            prefixes: &[],
            prefix_exes: &[],
        };
        assert_eq!(
            find_known(&orca, &[dir.clone()]).unwrap(),
            dir.join("OrcaSlicer").join("orca-slicer.exe")
        );
        let missing = KnownProgram {
            name: "Nope",
            relative: &["Nope/nope.exe"],
            prefixes: &[],
            prefix_exes: &[],
        };
        assert!(find_known(&missing, &[dir.clone()]).is_none());

        let roots = InstallRoots {
            program_files: Some(PathBuf::from(r"C:\Program Files")),
            program_files_x86: None,
            local_app_data: Some(PathBuf::from(r"C:\Users\Jason\AppData\Local")),
        };
        let bases = search_bases(&roots);
        assert_eq!(bases.len(), 2);
        assert_eq!(bases[0], PathBuf::from(r"C:\Program Files"));
        assert_eq!(bases[1].to_string_lossy(), r"C:\Users\Jason\AppData\Local\Programs");
        let unix_roots = InstallRoots {
            program_files: Some(dir.join("pf")),
            program_files_x86: None,
            local_app_data: Some(dir.join("local")),
        };
        let unix_bases = search_bases(&unix_roots);
        assert_eq!(unix_bases, vec![dir.join("pf"), dir.join("local").join("Programs")]);
        let _ = fs::remove_dir_all(&dir);
    }

    #[cfg(unix)]
    fn wait_for_file(path: &Path) -> String {
        for _ in 0..50 {
            if let Ok(text) = fs::read_to_string(path) {
                if !text.is_empty() {
                    return text;
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        panic!("timed out waiting for {}", path.display());
    }
}
