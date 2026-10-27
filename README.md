# 3D File Library

A Windows desktop app for an FDM and resin print library. It stores files in a folder you choose, then lets you browse, tag, preview, and drag them into a slicer.

How to use the app is on the [wiki](https://github.com/rgeldr/3DFileManager/wiki).

## Features

- Library folder chosen on first launch. **File > Move library** moves it later. An empty library starts with FDM Prints, Models, and Wargaming Terrain.
- Nested folders. Create, rename, and delete an empty folder. Drag a folder onto another folder to move it.
- Import files, folders, and zip, rar, and 7z archives by dropping them on the window or from the File menu. Same-volume files are hard-linked; otherwise they are copied. Duplicates are detected by hash.
- Sort name, creator, notes, and tags on each file. Search matches those fields plus the original file name. Filter by file type, tag (any or all), and creator. Search the current folder or the whole library.
- Views: Medium, Large, Extra large, List, and Details. Sort by name, size, date modified, date added, or creator. Dark and light themes.
- Resizable folder tree, details pane, and preview. The details pane can be pinned shut. Widths, preview height, view, theme, pin, and search scope are restored next launch.
- Mesh preview for stl, obj, and 3mf up to 150 MB. Thumbnails for images, meshes, and several slicer formats. Drag a file out to Explorer or a slicer. Open, Open in…, and Show in Explorer use the file’s catalog entry. Open in… starts a program you add under View > External programs.
- **File > Backup library**, **Import backup**, **Rescan library**, and **Clear thumbnail cache**. Missing files can be reviewed and removed from the catalog.
- **Help > About** shows the version (linked to [GitHub Releases](https://github.com/rgeldr/3DFileManager/releases)), file count, folder count, and size on disk, and can check for updates.

## Formats

Library files: `stl`, `3mf`, `obj`, `gcode`, `bgcode`, `ctb`, `chitubox`, `ags`, `lys`, `png`, `jpg`, `jpeg`, `pdf`, `txt`, `step`, `stp`, `f3d`, `md`, `scad`.

Archives: `zip`, `rar`, `7z`.

PNG and JPG thumbnails are resized so the long edge is at most 256 pixels and cached by file hash. CTB, Chitubox, Lychee, AGS, gcode, bgcode, 3MF, and Fusion `.f3d` files can show an embedded preview image when one is present. PDF, TXT, MD, and SCAD files are stored and shown with a badge. TXT, MD, and SCAD also show a read-only preview of the first 4KB. STEP files are stored without an in-app preview. There is no Lychee mesh preview and no in-app PDF renderer.

## Install

Download the NSIS installer from [GitHub Releases](https://github.com/rgeldr/3DFileManager/releases). The file is named `3D.File.Library_<version>_x64-setup.exe`, for example `3D.File.Library_26.10.28_x64-setup.exe`. It installs for the current user and uses WebView2.

## Updates

On each launch the app checks [latest.json](https://github.com/rgeldr/3DFileManager/releases/latest/download/latest.json). A newer release shows a banner with **Install** and **Later**. Later hides the banner until the next launch. A failed or offline check stays quiet.

**Help > About > Check for updates** compares the installed version with that file. A newer release shows the version and **Install**. Install downloads the NSIS installer, verifies its signature, and runs it. Otherwise About says **You're up to date.** or shows the error. Versions compare as semver, so 26.10.28 is newer than 26.10.9.

## Build

Windows, from PowerShell. You need Node, Rust, and a MinGW `dlltool.exe`. `scripts/with-mingw.mjs` uses one already on `PATH`, or `%USERPROFILE%\mingw\winlibs\mingw64\bin`.

```powershell
npm install
npm run tauri build
```

`npm run tauri dev` runs the app against the Vite server on port 1420. `npm run tauri build` runs `npm run version:check` and `npm run build` before the Rust build.

Versions are `YY.MM.N` (for example `26.10.28`) and must match in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`. `npm run version:check` requires that `YY.MM` is the current month. `npm run version:bump` increments `N` in the current month, or starts at `.1` when the month changes.

The updater accepts only valid semver. `26.10.28` works. A January version written as `26.01.1` does not, because of the leading zero.

## Release

The public key is `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`. Do not commit the private key. `.env` files are not read. In the same PowerShell session, before `npm run tauri build`:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw "C:\path\to\3d-file-library.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "the password for that key"
npm run tauri build
```

`TAURI_SIGNING_PRIVATE_KEY` may be the key file contents, as above, or the path to the key file. Generate the key once, if you do not already have the one that matches the pubkey:

```powershell
npm run tauri signer generate -- -w $env:USERPROFILE\.tauri\3d-file-library.key
```

The signed build writes the installer and `3D.File.Library_<version>_x64-setup.exe.sig` under `src-tauri/target/release/bundle/nsis/`. A local build does not write `latest.json`. Create that file yourself. The `signature` value is the entire `.sig` file. The `url` must use the GitHub release tag exactly. Tags have no `v` prefix, so a release tagged `26.10.28` uses `releases/download/26.10.28/`, not `releases/download/v26.10.28/`.

```json
{
  "version": "26.10.28",
  "notes": "What changed in this release.",
  "pub_date": "2026-10-21T20:40:00Z",
  "platforms": {
    "windows-x86_64-nsis": {
      "signature": "<entire contents of the .sig file>",
      "url": "https://github.com/rgeldr/3DFileManager/releases/download/26.10.28/3D.File.Library_26.10.28_x64-setup.exe"
    }
  }
}
```

Create a GitHub release tagged with that version and upload the `.exe`, the `.exe.sig`, and `latest.json`. The app reads `latest.json` from the latest release.

## Tests

```powershell
npm test
npm run test:unit
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib -- --test-threads=1
```

`npm test` checks the version files and that the frontend only calls plugin commands granted in `src-tauri/capabilities`. `npm run test:unit` runs Vitest. Rust tests should run one at a time so temporary libraries do not collide.

## Layout

- `src/` is the React UI: folder tree, file grid, inspector, viewer, and dialogs.
- `src-tauri/src/` is the Tauri commands, SQLite catalog, import, and thumbnails.
- `src-tauri/icons/` is the app icon used by the window, taskbar, and installer. `icons/drag.png` is only the drag-out ghost.
- `src-tauri/windows/installer.nsi` is the NSIS template. The Start menu shortcut comes from that template.

## Data

The catalog and settings are not inside the library folder. They live in `%APPDATA%\3D File Library\` (`dirs::data_dir()` plus `3D File Library`):

- `library.db`
- `settings.json` with `libraryRoot`, `theme`, `gridSize`, `sidebarWidth`, `inspectorWidth`, `previewHeight`, `inspectorPinned`, `searchScope`, `thumbRetry`, and `externalPrograms`
- `thumbs\{sha256}.png`
- `debug.log`

`thumbRetry` records that unavailable PNG and JPG rows were queued once for a new thumbnail pass. Later decode failures stay unavailable and are written to `debug.log`.
