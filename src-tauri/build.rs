fn main() {
    tauri_build::build();
    link_gnu_test_manifest();
}

// Rust's default test-harness manifest does not request Common Controls v6.
// The library links TaskDialogIndirect, so without this the test exe dies
// during process startup on Windows.
fn link_gnu_test_manifest() {
    let target = std::env::var("TARGET").unwrap_or_default();
    if !target.contains("windows-gnu") {
        return;
    }
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let out_dir = std::env::var("OUT_DIR").unwrap();
    let rc = std::path::Path::new(&manifest_dir).join("windows/controls.manifest.rc");
    let obj = std::path::Path::new(&out_dir).join("controls-manifest.o");
    let status = std::process::Command::new("windres")
        .current_dir(rc.parent().unwrap())
        .arg("-i")
        .arg(&rc)
        .arg("-o")
        .arg(&obj)
        .status();
    match status {
        Ok(code) if code.success() => {
            println!("cargo:rustc-link-arg={}", obj.display());
            println!("cargo:rerun-if-changed={}", rc.display());
        }
        other => {
            println!("cargo:warning=could not compile the Windows test manifest: {other:?}");
        }
    }
}
