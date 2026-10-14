# 3D File Library

A Windows desktop library for FDM and resin print files. It copies or hard-links files into a folder you choose, then lets you browse, tag, preview, and drag them into a slicer.

## What it does

On first launch you pick a library folder. That choice is stored with the app and is not changed later. If the folder is empty, the app creates three folders: FDM Prints, Models, and Wargaming Terrain.

You can add nested folders, rename them, and delete a folder when it is empty. Drag a folder onto another folder to move it. Files can be tagged, given a creator and a sort name, and found with full-text search. The grid has three sizes and the app has a dark and a light theme.

The folder tree and the details pane can be resized. Both widths are saved and restored the next time the app opens. A clipped folder name shows the full name in a tooltip.

Right-click a folder for New folder, Rename, Delete (not on the library root), Tag contents, and Set Creator. Set Creator asks whether to include subfolders and suggests creators already in the library.

Drag a file out of the grid to Explorer or a slicer. If a library path is too long for the Windows shell, the app stages a short copy or hard link under the temp folder and drags that instead. Right-click a tile for Open and Show in Explorer. Dropping files or folders onto the window still imports them.

Import accepts files, folders, and zip, rar, and 7z archives. When an import finishes you can keep the originals or move the imported files and duplicate originals to the Recycle Bin. Unsupported files and files that failed to import stay where they were, and the source folder is not recycled. The finish dialog can also set a creator and tags on the newly imported files only. Leave those fields blank to leave the files unchanged. Duplicates already in the library are not updated.

Help > About shows the running app version and opens this README on GitHub.

## Formats

Library files: `stl`, `3mf`, `obj`, `gcode`, `bgcode`, `ctb`, `chitubox`, `ags`, `lys`, `png`, `jpg`, `jpeg`.

Archives: `zip`, `rar`, `7z`.

Mesh preview and mesh thumbnails: `stl`, `obj`, and `3mf`, up to 150 MB. PNG and JPG thumbnails are generated in the app, resized so the long edge is at most 256 pixels, and cached by file hash. There is no Lychee preview.

## Install

The Windows installer is NSIS, current user, and uses WebView2. After a release build it is under `src-tauri/target/release/bundle/nsis`. The Start menu shortcut comes from the Tauri NSIS template. The installer script is `src-tauri/windows/installer.nsi`.

## Develop

You need Node, Rust, and a MinGW `dlltool.exe`. `scripts/with-mingw.mjs` looks for it under `%USERPROFILE%\mingw\winlibs\mingw64\bin`.

```bash
npm install
npm run tauri dev
```

The Vite dev server uses port 1420. `npm run tauri build` runs `npm run version:check` and `npm run build` before the Rust build. `scripts/version.mjs` keeps `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` on the same version.

## Tests

```bash
npm test
npm run test:unit
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib -- --test-threads=1
```

`npm test` checks that the version files match. `npm run test:unit` runs the Vitest suite. Rust tests should run one at a time so temporary libraries do not collide.

## Layout

- `src/` is the React UI. `src/components/` has the folder tree, file grid, inspector, and viewer. `src/lib/renderThumb.ts` and `src/workers/meshParse.worker.ts` render mesh stills.
- `src-tauri/src/` is the Tauri commands, SQLite database, import, and thumbnail code.

## Data

The database and settings are not inside the library folder. They live in `%APPDATA%\3D File Library\` (`dirs::data_dir()` plus `3D File Library`):

- `library.db`
- `settings.json` with `libraryRoot`, `theme`, `gridSize`, `sidebarWidth`, `inspectorWidth`, and `thumbRetry`
- `thumbs\{sha256}.png`
- `debug.log`

`thumbRetry` records that unavailable PNG and JPG rows were queued once for a new thumbnail pass. Later decode failures stay unavailable and are written to `debug.log`.
