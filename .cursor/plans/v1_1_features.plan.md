---
name: v1.1 features
overview: Help/About, resizable panes, folder creator, import tags and creator, drag-out and image-thumbnail bugfixes, a current README, and test coverage.
todos:
  - id: cancel-test
    content: Make cancel_stops_after_current_file deterministic by not depending on the 250ms progress throttle
    status: completed
  - id: image-thumbs
    content: Log image decode failures, prioritize PNG/JPG thumbs, requeue unavailable images, and show a generated thumb in the grid
    status: completed
  - id: drag-out
    content: Log drag paths and fix Windows no-drop for long or \\?\ paths, with Open and Show in Explorer fallbacks
    status: completed
  - id: pane-widths
    content: Add a sidebar splitter and an inspector splitter and persist both widths in settings.json
    status: completed
  - id: about-dialog
    content: Add Help > About with getVersion and a GitHub README link
    status: completed
  - id: folder-creator
    content: Add Set Creator on the folder context menu, with subfolder choice and creator autocomplete
    status: completed
  - id: import-meta
    content: Add optional tags and creator to the import-finished dialog, applied only to newly imported files
    status: completed
  - id: readme
    content: Rewrite README.md from the current app (formats, install, build, tests, layout, data locations)
    status: completed
  - id: test-coverage
    content: Add unit tests for the uncovered preview, CTB, settings, and drag/thumb helpers, and record llvm-cov plus vitest coverage
    status: completed
isProject: false
---

# v1.1 features

Implemented on `cursor/v1-1-features-plan-bbc7`, branched from `cursor/preview-drag-security-f6b2` (PR #1).

Version strings today are `26.10.11` in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`, kept together by `scripts/version.mjs`.

## Implementation order

1. **Cancel test** — small, and it is already red or flaky on a fast disk. Land it before other Rust edits so later test runs mean something.
2. **Image thumbnails** — the grid bug. The codec path already exists; make failures visible, requeue `unavailable` images, and show a successful thumb.
3. **Drag-out** — log the real paths first, then the short-path fallback and the explorer/open fallbacks.
4. **Pane widths** — one settings change shared by the sidebar and the inspector.
5. **About** — menu plus dialog. No data-model change.
6. **Set Creator** — context menu already exists; add one command and one dialog.
7. **Import tags and creator** — fold into the finish dialog. Depends on creators/tags autocomplete that already exists.
8. **README** — write it last in the implementation series so it describes the behavior that actually shipped. The content outline below is the current app, plus a short note for each v1.1 behavior as it lands.
9. **Coverage pass** — tests go in with the change they lock. The llvm-cov and vitest reports are the last check, after the features compile.

## 1. Help > About

**Goal.** Help > About shows the running app version and opens the README on GitHub.

The user said GitLab. This repo’s remote is GitHub: `https://github.com/rgeldr/3DFileManager`. The About link should be `https://github.com/rgeldr/3DFileManager#readme`. Do not link a GitLab URL.

**Files.**

- `src/App.tsx` — the menu is built in the `useEffect` that calls `Menu.new` (File and View only, around the `ready` effect). Add a Help submenu with an About item that opens a modal.
- `src/styles.css` — only if the existing `.card` / `.modal-back` layout is too tight for a second line and a link button.
- `src-tauri/capabilities/default.json` — only if `getVersion()` or `openUrl` is denied.

**Approach.**

- `import { getVersion } from "@tauri-apps/api/app"` and read it when the dialog opens. That value is the Tauri bundle version baked from `tauri.conf.json` at build time, which `scripts/version.mjs` already keeps equal to the Cargo package version. Do not hardcode `26.10.11`.
- `core:default` is expected to include `core:app:default`. If the invoke is rejected, add that permission. Do not shell out to read `Cargo.toml` from the installed app.
- Open the README with `openUrl` from `@tauri-apps/plugin-opener` (the plugin is already initialized in `src-tauri/src/lib.rs` `run`, and the inspector already uses `openPath` / `revealItemInDir`). If the default opener scope blocks https, allow `https://github.com/rgeldr/3DFileManager*`.
- Dialog copy: product name “3D File Library”, the version, and a button “View README on GitHub”.

**Edge cases.**

- `getVersion()` fails (capability, or `tauri` dev before the app context exists): show “Version unavailable” and still offer the link.
- External browser missing: surface the opener error in the existing error modal. Do not navigate the webview to GitHub.
- Menu effect currently depends on `[ready]` and rebuilds the whole menu. About can close over `setState`; keep using `actions.current` if the item must see fresh state. Do not rebuild the menu on every theme change beyond what that effect already does.

**Acceptance.**

- Help > About shows the same version as `tauri.conf.json` for that build.
- The button opens `https://github.com/rgeldr/3DFileManager#readme` in the system browser.
- File and View menus still work.

## 2. Resizable folder tree

**Goal.** Drag a splitter to widen the left tree so deep names are readable. Persist the width and restore it on the next launch. Keep a minimum and a maximum. Truncated names still have a tooltip with the full name.

Screenshot 1 is the current tree: `.folder-label` ellipsizes (`src/styles.css`, `.folder-label`), and `.app` is a fixed `grid-template-columns: 240px 1fr`. Indent is `8 + depth * 14` pixels in `Sidebar.tsx` `renderLevel`. At depth 12 the indent alone is about 176px, so a 240px pane has almost no room for the name.

**Files.**

- `src/styles.css` — replace the fixed `240px` column. Add a splitter hit target.
- `src/App.tsx` — width state, pointer drag, save.
- `src/components/Sidebar.tsx` — `title={folder.name}` on `.folder-label` (and the library root label).
- `src-tauri/src/settings.rs` — `sidebarWidth` on `Settings`.
- `src/types.ts` — same field on `Settings`.

**Approach.**

- Default width 240. Minimum 180. Maximum `min(640, 50% of the window width)`.
- The splitter is a 4px element between `.sidebar` and `.main`, not a resize of the window. `pointerdown` on the splitter, then `pointermove` / `pointerup` on `window` with `setPointerCapture`. Ignore clicks that do not move.
- Apply the width with an inline `gridTemplateColumns` (or a CSS variable `--sidebar-width`) so the grid, toolbar, and inspector stay in the remaining space.
- Persist on pointer-up, not on every move. Add `sidebarWidth` to `Settings` with `#[serde(default = "default_sidebar_width")]` so existing `%APPDATA%\3D File Library\settings.json` files still load. Save through the existing `settings::save` path (a small `set_sidebar_width` command, or one `set_pane_widths` command shared with item 3). Reject widths outside min/max in Rust as well as the UI.
- Tooltip: the native `title` attribute is enough. Do not add a custom tooltip library.
- Horizontal handling: keep the ellipsis. A second horizontal scrollbar inside the tree fights the splitter. Widening the pane is how the name becomes visible. The tooltip covers whatever is still clipped at the max width. Do not shrink indent; deep trees stay aligned with the rest of the explorer-style rows.

**Edge cases.**

- Width larger than the current window after a restore: clamp on launch and when the window resizes.
- Save fails: keep the in-memory width and surface the error. Do not revert mid-drag.
- Splitter drag must not start a folder-row drag (`Sidebar` pointer handlers) or a file drag (`App` `dragRef`). The splitter is not a folder row and not a tile.
- Theme tokens only. No new colors.

**Acceptance.**

- Dragging the splitter changes the tree width between 180 and the max.
- Restarting the app restores the saved width.
- A long nested name shows a tooltip with the full string when the label is clipped.
- Folder click, twist, keyboard, context menu, and folder drag-and-drop still work.

## 3. Resizable inspector

**Goal.** Same behavior for the right details pane. Today `.workspace` is `grid-template-columns: 1fr 320px` in `src/styles.css`.

**Files.** Same as item 2, plus no further Sidebar changes. `inspectorWidth` on `Settings` and `src/types.ts`. Splitter between `.grid-wrap` and `.inspector` inside `.workspace`.

**Approach.**

- Default 320. Minimum 240 (the viewer and the form labels need it). Maximum `min(560, 45% of the window width)`.
- Persist the same way as the sidebar, in the same `settings.json`, saved on pointer-up.
- The grid keeps `minmax(0, 1fr)` so a wide inspector does not overflow the window.

**Edge cases.**

- Both splitters saved, then a short window: clamp each independently so the grid column does not go to zero. If both maxes cannot fit, prefer the minimums and give leftover space to the grid.
- No selection: the empty inspector (“Select a file…”) still occupies the saved width.
- Viewer canvas listens to `ResizeObserver` already (`Viewer.tsx`). Confirm it resizes when the pane width changes.

**Acceptance.**

- Dragging the inspector splitter changes only that pane.
- Width survives restart, including together with a non-default sidebar width.
- Selecting a file, editing fields, Open, and Show in Explorer still work at the minimum width.

## 4. Folder context menu: Set Creator

**Goal.** Right-click a folder and choose Set Creator… It sets the creator on files in that folder, after asking whether to include subfolders. The field autocompletes from creators already in the library.

The menu already has New folder, Rename, Delete (not on the library root), and Tag contents… in `Sidebar.tsx` `openFolderContextMenu`. Keep those. Set Creator sits with Tag contents.

**Files.**

- `src/components/Sidebar.tsx` — menu item, callback prop.
- `src/App.tsx` — dialog state, patterned on `folderTagTarget`.
- `src/api.ts`, `src-tauri/src/lib.rs` — command `set_creator_under_folder`.
- `src-tauri/src/db.rs` — implementation next to `add_tags_under_folder`. `file_ids_under_folder` always includes subfolders via the recursive CTE. Add an `include_subfolders` flag rather than reusing that function blindly.

**Approach.**

- Dialog: creator text input with `list` pointing at the existing creators datalist (`list_creators`), a checkbox “Include subfolders” (default on), file count, Cancel, Apply.
- Count uses the same folder scope as Apply, so the count matches the checkbox.
- Library root with subfolders included: every non-missing file. Root without subfolders: `folder_id IS NULL` only.
- A nested folder without subfolders: `folder_id = id` only.
- Require a non-empty trimmed creator. This action is explicit, unlike the import dialog where blank means “leave it”. Do not offer “clear creator” here.
- One transaction. Update `files.creator` for the chosen ids. The FTS triggers in the schema already refresh `files_fts` on update. Do not rewrite tags.
- Autocomplete is the same `datalist` pattern as `Inspector.tsx`. A new name that is not in the list is allowed.

**Edge cases.**

- Folder with no files: Apply disabled, same as Tag contents when `folderTagFileCount === 0`.
- Creator equal to the current value: still run the update; it is harmless.
- Very large folders: one `UPDATE … WHERE id IN (…)` (chunked, the tag query already chunks at 500) inside the transaction, not one `update_file` call per row. `update_file` can also move the file on disk; this command must not move anything.
- Missing files (`missing = 1`) are skipped.
- Dialog open sets `dialogOpen`, which pauses the thumbnail pump. That is existing behavior. Closing the dialog lets the pump resume.

**Acceptance.**

- Set Creator on a parent with “Include subfolders” checked updates nested files and does not change a sibling folder.
- Unchecked updates only files stored directly in that folder.
- The datalist shows existing creators. A brand-new name is saved and then appears in the toolbar creator filter.
- New folder, Rename, Delete, and Tag contents still work. Delete is still absent on the library root.

## 5. BUG: drag-out shows the no-drop cursor

**Goal.** Dragging a library file onto a slicer drops the file. When the drag cannot be made acceptable, the user can Open or Show in Explorer instead.

**What the code does today.**

`src/App.tsx` does not use HTML5 drag. Tiles are `<button>` elements. `pointermove` sets `dragRef`, and when the pointer leaves the webview (`clientX`/`clientY` outside the viewport) it calls `startDrag` from `@crabnebula/tauri-plugin-drag` (plugin 2.1.1, `drag` crate 2.1.1):

```ts
const paths = files.filter((file) => drag.ids.includes(file.id)).map((file) => file.absolutePath);
const thumb = files.find((file) => drag.ids.includes(file.id) && file.thumbPath)?.thumbPath;
const icon = thumb ?? (await fallbackDragIconPath());
await startDrag({ item: paths, icon });
```

`startedNative` is set true before that async function finishes, so a failed attempt is not retried. `fallbackDragIconPath` is `drag_icon_path` in `src-tauri/src/lib.rs`, which resolves bundled `icons/drag.png` (128×128 RGBA, 1079 bytes). `tauri.conf.json` has `dragDropEnabled: true` so Explorer drops *into* the window still work. That flag does not build the outbound file list.

`absolutePath` comes from `AppDb::hydrate_with_tags` in `src-tauri/src/db.rs`: `library_root.join(stored_relpath)`. `set_library_root` stores `path.canonicalize()`. On Windows that string is a `\\?\` extended path. `stored_relpath` uses forward slashes; Rust’s Windows `Path` display turns the joined path into backslashes.

Import tries `fs::hard_link` first (`import_file` in `src-tauri/src/import.rs`) and copies if the link fails. Hard links do not change the path identity `canonicalize` returns.

**What drag 2.1.1 does on Windows** (`drag` 2.1.1 `src/platform_impl/windows/mod.rs`):

- Every path is `dunce::canonicalize`’d. If any path is missing, `start_drag` returns `Err` and the app’s `catch` opens the error modal. That is a different symptom from a red cursor.
- `dunce` strips a leading `\\?\` only when the simplified path is a legacy path (no trailing dot or space, and length at or under the legacy 260 limit). Deep Artisan Guild trees in screenshot 1 are how a library path crosses that limit. Those paths stay `\\?\…`.
- The data object is a shell item array built with `ILCreateFromPathW`. That API does not accept `\\?\` or paths longer than `MAX_PATH`. A null PIDL makes `SHCreateShellItemArrayFromIDLists` fail or produce a data object the slicer will not accept. The slicer then shows the no-drop cursor. Short STL paths are simplified to `C:\…` and drop. That matches “some .stl files work, others do not.”
- `QueryContinueDrag` treats “left button is up” as an immediate drop. `startDrag` is invoked only after an `await`, and only once the pointer is already outside the webview. If the button is up by the time `DoDragDrop` runs, the operation ends at once. That matches the intermittent case on a file that otherwise works.
- The drag image is separate from the file list. A bad icon is ignored (`get_drag_image` returns `None`). `IDragSourceHelper::InitializeFromBitmap` is still called when the icon loads, and a large or odd PNG can attach a broken drag image. Thumbnails are up to 256px; `drag.png` is 128px. Prefer the bundled icon for every drag so the thumbnail path is not part of the experiment.
- Spaces and `&` are not split: the shell item is a wide path, not a command line. They stay on the test matrix, but they are not the likely cause.
- Multi-select passes every selected path. One missing path fails the whole `canonicalize` loop with an error dialog. One over-long path can make the whole drop unacceptable.
- The asset-protocol scope change in PR #1 does not affect this. Outbound drag uses `std::fs` paths inside the `drag` crate, not `convertFileSrc`.

**Diagnosis to land before changing behavior.**

Log one line through the existing `debug_log` command (`%APPDATA%\3D File Library\debug.log`) at the moment `startDrag` is called, and log the promise result (resolve vs the error string):

- each `absolutePath` as passed to `startDrag`
- character length, whether it starts with `\\?\`, whether it contains a forward slash, whether `exists` would be true (add a tiny Rust command that `dunce`-canonicalizes and returns the simplified path plus its length; do not guess from the JS string alone)
- icon path, whether it is the thumbnail or `drag.png`, and the icon file’s byte size
- selected id count
- milliseconds from pointer-leave to the `startDrag` call

Reproduce with one short STL, one STL whose full path is longer than 260 characters, one path with spaces, one hard-linked import, and a multi-select of a good file plus a long-path file. Confirm the long path is the one `dunce` leaves as `\\?\`.

**Fix.**

- Prefetch `drag.png` (already started in the bootstrap effect). Pass that path as `icon` for every drag. Do not await anything else before `startDrag`.
- If the simplified path is longer than 259 characters or still has a `\\?\` prefix, stage a short file and drag that instead: hard link into `%TEMP%\3D File Library\drag\` under a sanitized file name, and `fs::copy` if the link fails (temp and the library are often different volumes). The slicer receives a short absolute path with the original file name and extension.
- If `startDrag` throws, keep the error modal, and add the same two actions the inspector already has (`openPath`, `revealItemInDir` in `Inspector.tsx`) for the selected file. Also add them to a right-click menu on a grid tile so the user is not dependent on the inspector.
- Leave `dragDropEnabled: true` so inbound drops still import.
- Do not fork `tauri-plugin-drag` unless the temp-path fallback still cannot drop. The app can hand the plugin a path `ILCreateFromPathW` accepts.

**Edge cases.**

- Temp hard link fails, copy fails (disk full, name collision): show the error and the Explorer action. Do not pretend the drag started.
- Multi-select: stage each file independently. If one cannot be staged, drag the ones that can and say which name was skipped. Do not fail the whole gesture on one long path.
- Cleanup: delete staged files older than a day on launch, or on the next drag. Do not delete the library file.
- Drag that ends back inside the window still moves files between folders (`onUp` in `App.tsx`). `startedNative` must still suppress that move.
- A second pointerup after `DoDragDrop` returns must not also move the file.

**Acceptance.**

- A short STL drops onto OrcaSlicer, Bambu Studio, or ChiTuBox.
- An STL whose library path is longer than 260 characters drops, and the debug log shows a staged short path.
- A path with spaces, and a hard-linked import, drop.
- Multi-select of two good files drops both.
- When staging fails, Show in Explorer reveals the library file.
- Dropping files from Explorer onto the app still imports them.
- An in-app drag onto a folder still moves the file and does not call `startDrag`.

## 6. BUG: PNG and JPG grid thumbnails

**Goal.** PNG and JPG tiles show a 256px preview. Rows already marked `unavailable` are generated again.

**What the screenshot is.** The blue “PNG” / “JPG” text is `.type-icon` in `LazyThumb` (`src/components/FileGrid.tsx`). That branch is taken when `previewIconsEnabled` is false, `file.thumbPath` is null, or the intersection observer has not yet set `showImage`. It is not a broken `<img>`. A failed asset request would show a broken image in the other branch (`alt=""`).

`thumbPath` is set only in `hydrate_with_tags` when `thumb_status == "ok"` and `%APPDATA%\3D File Library\thumbs\{sha256}.png` exists.

**Samples.** Both files were decoded with the same libraries `image` 0.25.10 uses (`png` 0.18.1 and `zune-jpeg` 0.5.15, from `src-tauri/Cargo.lock`). The codec is not why these two bytes fail.

| File | Actual contents |
| --- | --- |
| `oni_clan_no_thumb.jpg` | 270,848 bytes. Baseline JPEG (SOF0), 1280×720, 8-bit, 4:2:0 YCbCr. No EXIF, no ICC, not progressive, not CMYK. `zune-jpeg` decoded 2,764,800 pixels. |
| `rodburg_no_thumb.png` | 4,497,629 bytes. 1920×1080, 8-bit RGB, no interlace. Chunks: IHDR, pHYs, an uncompressed `iTXt` XMP packet (30,750 bytes), four IDAT chunks, IEND. Every chunk CRC matched. `png` 0.18.1 decoded 6,220,800 bytes. |

The “1024×576, 265KB” description is the same JPEG at a slightly different size; the file on disk is 1280×720. 4.3MB matches the PNG.

There is already an image thumbnail path. `extract_thumbnail_png` in `src-tauri/src/preview.rs` matches `png` / `jpg` / `jpeg` and calls `load_image_file`, which is `image::open(path).ok()` then `encode_fit` (resize so the long edge is at most 256, `FilterType::Triangle`, encode PNG). `next_thumbnail` in `src-tauri/src/lib.rs` writes that PNG to `thumb_path(data_dir, sha256)` and sets `thumb_status` to `ok`. If `extract_thumbnail_png` returns `None` and the file is not a mesh under 150MB, it sets `unavailable` and returns `kind: "skip"`. `unavailable` is sticky until Clear thumbnail cache (`clear_thumbs` deletes every cached PNG, including good ones).

`image::open(...).ok()` throws away the `ImageError`. A sharing violation, a `\\?\` open failure, or a missing file looks the same as a corrupt image, and the row is never retried.

**Why the grid stays on the label even for a valid file.**

- `previewIconsEnabled` flips true five seconds after the library view is ready (`App.tsx`). Until then every tile is the extension label, including ones that already have `thumbPath`.
- The pump (`pumpThumbs`) does not run while `dialogOpen` is true (import finish, errors, folder dialogs). Cleanup bumps `thumbGeneration`, so a pump interrupted before `refreshLists` does not paint thumbs it already wrote until the next pump’s final refresh.
- `claim_next_pending_thumb` is `ORDER BY id` and the pump does mesh renders inline (`kind == "render"`) before it can reach later images. A library of STLs in front of the pictures keeps the pictures on `thumb_status = "none"`, which also has a null `thumbPath`. The loop stops after 5000 jobs and does not schedule another pass.
- `LazyThumb` bails out of the observer when `scrollRoot` is null. The child’s effect runs before `FileGrid` copies `scrollRootRef.current` into state. The next render usually repairs this. It is not the main bug, but a tile that never gets `scrollRoot` stays on the label forever even with a thumb on disk.
- Hard-linked imports stay `unhashed` until `hash_pass` sets `thumb_status` back to `none`. They correctly wait. `hash_error` is a separate terminal state and should not be requeued.

Asset scope and CSP are unlikely for this screenshot: `img-src` already allows `asset:` and `http://asset.localhost`, and `allow_asset_scope` grants the thumbs directory. If a thumb file exists and the tile still shows the letters, `thumbPath` was null or the 5s/observer gate was closed. If an `<img>` is mounted and blank, then log `onError` and check the scope. Those are different bugs.

**Approach.**

- Change `load_image_file` / `extract_thumbnail_png` so image failures return the `ImageError` string. `next_thumbnail` writes it to `debug.log` and sets `unavailable` only for a real decode error. A missing file stays the existing skip. An IO error (sharing violation, path too long) should stay `none` or a new `retry` status so the next pump tries again, with a small attempt cap so a permanent IO error does not spin.
- Keep the `image` crate at 0.25 with `png` and `jpeg`. Do not add another decoder. Cache key stays sha256. Long edge stays 256. Do not upscale smaller images (`encode_fit` already leaves them).
- Decode outside the DB mutex. `next_thumbnail` currently holds the lock for the whole `image::open`.
- Claim `png` / `jpg` / `jpeg` (and other files `extract_thumbnail_png` can finish in Rust) before `stl` / `obj` / `3mf` render jobs, so pictures are not stuck behind mesh renders.
- On first launch of this build, requeue image rows with `thumb_status = 'unavailable'` back to `none` once (a `thumbRetry` integer in `settings.json`, default 0, set to 1 after the update). Do not delete `ok` thumbs. If a row fails decode again, it returns to `unavailable` and the log has the error. Do not requeue `hash_error` or `unhashed`.
- After a `kind: "done"` image job, refresh the file list on a short cadence (for example every 10 completions, and when the queue idles), not only when the entire mesh backlog finishes. Remove the silent 5000 cap or continue in another pass while the library view is open and no dialog is up.
- `LazyThumb`: once `previewIconsEnabled` and `thumbPath` are set, if the observer root is missing, show the image anyway when the tile is in the first screenful. Add `onError` that logs the src and leaves the extension label, so a scope failure is visible in `debug.log`.
- Keep the five-second delay that the explorer-tree plan added. Do not start the wait over when the user changes folders.

**Tests to add with the fix** (fixtures can be these two files, or generated images of the same kinds if the samples should not be committed):

- Baseline 4:2:0 JPEG and 8-bit RGB PNG both produce a PNG whose long edge is 256.
- A 16×16 PNG is not upscaled.
- A truncated file returns an error string and does not panic.
- `next_thumbnail` on a PNG sets `ok` and writes `{sha}.png`. A second claim does not pick it up.
- Requeue sets `unavailable` images back to `none` and leaves `ok` and `unhashed` alone.

**Edge cases.**

- Progressive, CMYK, and EXIF JPEGs are not what these samples are. Still include one progressive JPEG in the tests if `zune-jpeg` 0.5.15 accepts it; if it does not, log that error and leave the row `unavailable` rather than crashing the pump.
- PNG larger than the `image` crate’s default 512MiB alloc limit: log the limit error, mark `unavailable`. These samples are far under it (about 6MB decoded).
- Empty sha256: do not write `thumbs/.png`. Leave the row alone until the hash pass fills sha256.
- Two rows with the same sha share one thumb file. That is the current cache key and is correct.

**Acceptance.**

- The two sample files, imported into a short folder, show image previews in the grid after the existing five-second delay, including after an app restart.
- A row that was `unavailable` for a PNG/JPG is retried and, for these samples, becomes `ok`.
- An STL mesh thumb still generates. Clear thumbnail cache still works.
- `debug.log` contains the decoder error for a deliberately corrupt JPG, and the pump continues to the next file.
- The inspector still shows the full image via `convertFileSrc(file.absolutePath)` for png/jpg (`Viewer.tsx` `previewImage`).

## 7. README

**Goal.** Replace the two-line `README.md` with a description of this repo as it actually behaves. Update it again as items 1–6 and 8 land, so the README does not advertise a splitter or an About dialog before they exist.

**Source of truth (current app).**

- Stack: Tauri 2, Vite, React 19, TypeScript, SQLite (`rusqlite` bundled). Windows NSIS, current-user, WebView2. `src-tauri/windows/installer.nsi`.
- What it does: copy or hard-link files into a library folder the user picks on first launch (`set_library_root`; no default path; the choice is permanent in the current code). Default subfolders created if the tree is empty: FDM Prints, Models, Wargaming Terrain. Nested folders, rename, delete (empty only), drag folders to move them. Tags, creator, sort name, FTS search, grid sizes, dark/light theme. Rescan. Drag files out to a slicer or Explorer. Import of files, folders, and zip/rar/7z. After import, keep originals or recycle imported and duplicate originals only.
- Formats (`names::is_supported_file`): stl, 3mf, obj, gcode, bgcode, ctb, chitubox, ags, lys, png, jpg, jpeg. Archives: zip, rar, 7z. Mesh preview and mesh thumbs: stl, obj, 3mf, up to 150MB. No Lychee rendering.
- Install: NSIS installer from `src-tauri/target/release/bundle/nsis` after `npm run tauri build`. Start menu shortcut is part of the Tauri NSIS template.
- Dev: Node, Rust, and a MinGW `dlltool.exe` (see `scripts/with-mingw.mjs`, which looks in `%USERPROFILE%\mingw\winlibs\mingw64\bin`). `npm install`, then `npm run tauri dev`. Vite port 1420 (`vite.config.ts`). `beforeBuildCommand` runs `npm run version:check` and `npm run build`.
- Tests: `npm test` is `node scripts/version.test.mjs` only. Rust: `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib -- --test-threads=1`. There is no vitest script yet (item 9 adds it).
- Layout: `src/` UI, `src-tauri/src/` commands and SQLite, `src/components/{Sidebar,FileGrid,Inspector,Viewer}.tsx`, `src/lib/renderThumb.ts`, `src/workers/meshParse.worker.ts`.
- Data, not inside the library folder: `%APPDATA%\3D File Library\` (`dirs::data_dir()` + `3D File Library` in `data_dir()`). Files: `library.db`, `settings.json` (`libraryRoot`, `theme`, `gridSize`), `thumbs\{sha256}.png`, `debug.log`.

**Edge cases.** Do not document a feature from the old plan files that the code does not do (library root cannot be changed; delete folder requires an empty folder). Do not paste the plan docs into the README.

**Acceptance.** A new reader can install, run `npm run tauri dev`, find the data folder, and see the supported extensions, without reading the Rust.

## 8. Import finish: tags and creator

**Goal.** The keep-or-recycle dialog can optionally set tags and a creator on the files that were just imported. Blank means leave them unchanged.

**Current UI.** `runImport` in `src/App.tsx` sets `summary` always, and sets `bulk` when `importedIds.length` is between 2 and 200 (`BULK_TAG_LIMIT`). The finish card renders only when `summary && !bulk`. The separate “Tag this import” card renders when `bulk` is set, and it is what the user sees first. Apply calls `apply_bulk_meta` (`src-tauri/src/lib.rs`), which sets creator via `update_file` and replaces tags via `set_tags`. Skip closes the tag card and the finish card then appears. A single-file import never shows the tag card. More than 200 files never shows it.

`importedIds` is pushed only for a new insert (`import_file`). Duplicate sha256 hits increment `duplicate_count` and do not get an id. Recommendation: do not apply tags or creator to duplicates. They are already in the library with their own metadata, and `importedIds` already excludes them. Say that in the dialog (“Applies to newly imported files only”).

Hard-link imports that later lose the race in `hash_pass` (`sha_exists_other` then `delete_files`) are in `importedIds` until that pass deletes the extra row. Applying metadata to that extra row and then deleting it does not change the kept original. That is the right outcome for “not duplicates.” Apply to the ids still present at click time; ignore ids the hash pass already removed.

**Files.**

- `src/App.tsx` — fields on the finish card. Remove the separate bulk card so the user is not asked twice, or make the bulk card unused.
- `src/styles.css` — tag chips already exist (`.tag` in the inspector). Reuse them.
- `src-tauri/src/lib.rs` `apply_bulk_meta` — prefer one transaction for the imported id list instead of per-id `update_file` (that function can also move files). Blank creator skips the creator column. Null/empty tags skip tags. Non-empty tags replace tags on those new rows (they have none yet).

**Approach.**

- Two controls, both empty when the dialog opens: a creator input with the creators datalist, and tag chips plus an input with the tags datalist (same interaction as `Inspector.tsx`: Enter adds a chip, click removes it).
- Both “Keep originals” and “Move to Recycle Bin” apply the fields first if either is non-blank, then do what that button already does. If both are blank, do not call the command.
- Works for one file and for more than 200 files. No `BULK_TAG_LIMIT` gate.
- Do not pass duplicate paths or unsupported files.

**Edge cases.**

- User clicks recycle, apply fails: do not start the recycle. Show the error. Leave the dialog up.
- Cancel is not a third button; Keep originals remains the “don’t recycle” choice.
- Tag that already exists, different case: `set_tags` / `ensure_tag_id` already collapse case with `COLLATE NOCASE`. Match the inspector, which treats case-insensitive duplicates as the same chip.
- Import cancelled before any inserts: `importedIds` empty, hide the fields or show them disabled.

**Acceptance.**

- Blank fields, Keep originals: creators and tags on the new files stay empty.
- A creator and two tags, then either button: those new files show them in the inspector and in search. A duplicate skipped by sha256 does not change.
- One-file import shows the same fields.
- Recycle behavior from PR #1 is unchanged: unsupported files and failed files stay in place; the source folder is not recycled.

## 9. Test coverage

**The graph-coverage skill exists** at `.cursor/skills/graph-coverage/SKILL.md` (this is the repo path the user called `/cursor/skills/graph-coverage/`). It was followed. It is static linkage, not executed line coverage. `covers` edges are name mentions in `#[test]`, `*.test.*`, `*.spec.*`, and `scripts/version.test.mjs`.

Command run: `node .cursor/skills/graph-coverage/scripts/graph-coverage.mjs`. The JSON was not committed.

### Graph coverage report

**Scope.** `src/` and `src-tauri/src/`. Static test linkage only (not executed coverage).

**Coverage.**

| Criterion | Covered | Total | Ratio |
| --- | --- | --- | --- |
| Node (NC) | 177 | 2957 | 6.0% |
| Edge (EC) | 557 | 2201 | 25.3% |
| Def-use pairs | 799 pairs, 532 unused defs, 0 ambiguous uses |  |  |

Graph size: 2976 nodes, 5028 edges (2201 cfg, 799 def-use, 514 call, 1 inherits, 1513 covers). 156 of 275 functions have a `covers` edge. Almost all of that linkage is Rust tests calling `import_paths`, `list_files`, and folder moves. The UI has no `covers` edges.

**Hotspots with no test link** (score = in-degree + out-degree):

1. `src/App.tsx:82` `App` — score 578. Drag-out, thumbnail pump, import dialog, menu.
2. `src/components/Sidebar.tsx:23` `Sidebar` — score 253.
3. `src/components/Viewer.tsx:77` `Viewer` — score 108.
4. `src/debugLog.ts:54` `installDebugProbes` — score 58.
5. `src/lib/renderThumb.ts:81` `renderMeshStillInner` — score 57.
6. `src/components/Inspector.tsx:6` `Inspector` — score 43.
7. `src-tauri/src/preview.rs:174` `bgcode_preview` — score 30, no tests in the whole module.

Reviewed in that order for the test plan below. `import_organize_search_rescan_and_recycle` is a hotspot but it is already a test.

**Executed coverage, still to run.** This environment’s rustc is 1.83 and cannot build the locked tree (`pxfm` wants Cargo edition 2024). PR #1’s tests were run with rustc 1.99. Run the commands below on that toolchain (Windows dev machine or CI), not on 1.83.

- Rust: `cargo install cargo-llvm-cov` once, then `cargo llvm-cov --locked --manifest-path src-tauri/Cargo.toml --lib --html --output-dir target/llvm-cov -- --test-threads=1`. Open `target/llvm-cov/html/index.html`. Do not commit the HTML.
- Frontend: there is no vitest dependency and no `*.test.ts`. Add vitest and `@vitest/coverage-v8` as devDependencies. Script: `vitest run --coverage`. v8’s HTML reporter writes `coverage/index.html`. Keep `npm test` as the version-script test, and add `npm run test:unit` for vitest so the version check does not disappear.
- Tarpaulin is the fallback only if llvm-cov cannot build on the MinGW host. Prefer llvm-cov; one report is enough.

**Targets.** Static node coverage of 6% is mostly “UI and preview are invisible to the test linker.” Do not chase 80% of `App` as a single component test. Extract the pure decisions and test those. Aim for executed line coverage of at least 80% on the modules below, and a regression test for each bug in this plan.

| Module | Functions | Why |
| --- | --- | --- |
| `src-tauri/src/preview.rs` | `extract_thumbnail_png`, `load_image_file`, `encode_fit`, `png_from_bytes`, `find_3mf_image`, `largest_gcode_thumbnail` | No tests. Image thumbs and archive thumbs. Item 6. |
| `src-tauri/src/ctb.rs` | `extract_preview_png`, `decode_rle15`, `rgb565` | No tests. A small synthetic CTB header is enough. |
| `src-tauri/src/settings.rs` | `load`, `save` | No tests. New width fields must default when absent from old JSON. |
| `src-tauri/src/lib.rs` | `next_thumbnail`, `apply_bulk_meta` | Behavior tested via `AppDb` helpers where the command needs a Tauri `State`. Do not stand up a webview in unit tests. |
| `src-tauri/src/rescan.rs` | `rescan_with` | No direct tests. One fixture: a file added on disk shows up; a missing file is marked. |
| `src-tauri/src/hash_pass.rs` | `apply_hash_result` | Only used from import tests indirectly. One case for duplicate hard link, one for a missing path → `hash_error`. |
| `src/App.tsx` | the drag path list and the “blank meta means skip” decision | Pull both into pure functions and vitest them: icon is always the fallback path; over-long paths are flagged; blank creator and empty tags produce a null payload; a non-blank creator does not include duplicate ids. |
| `src/components/FileGrid.tsx` | `LazyThumb` | Vitest + jsdom: with `thumbPath` and previews enabled, an `img` is rendered; without `thumbPath`, the extension text is rendered. |
| `scripts/version.test.mjs` | already covered | Leave it on `npm test`. |

`bgcode_preview` and `gcode_preview` are worth one fixture each after the image tests, not before the bugs above.

### Flaky test `cancel_stops_after_current_file`

`src-tauri/src/import.rs` `ImportProgressCtx::tick` only calls the progress callback when 250ms have passed (`PROGRESS_MIN_INTERVAL`). The test sets `cancel` inside that callback once `current >= 1`.

`import_paths` calls `emit("Counting files")` and `emit("Importing…")` first, which set `last_emit` to now. The two tiny STL files then `tick` inside the same 250ms, so the callback does not run during the loop. `flush()` runs the callback after both files are imported. `summary.cancelled` stays false and `imported_count` is 2. On a slow disk the first `tick` can fall outside the window, the flag is set between the files, and the test passes. That is the flake. The in-app Cancel button sets `import_cancel` directly and does not use this callback, so production cancel is not the bug.

**Fix.** Invoke the progress callback from `tick` on every file (the UI already handles a stream of import-progress events; `folder_import_emits_per_file_progress` only checks the max `current`). Keep `flush()` so the last message is not lost. The test’s callback then sets the flag during file 1, and the existing `cancelled.load` check after that file stops before file 2. No `sleep`. Do not weaken the assertion to “at most 2.”

**Acceptance.** `cancel_stops_after_current_file` passes 20 times in a row with `--test-threads=1`. `folder_import_emits_per_file_progress` still sees a total of 3 and a final current of 3.

## Windows manual test checklist

Use a build that includes the items above, on the same library that showed the two bugs if possible.

- Help > About shows the build version. View README opens the GitHub README, not a GitLab URL.
- Widen the folder tree, restart, confirm the width. Narrow it to the minimum and confirm a deep Artisan Guild name ellipsizes and the tooltip shows the full name. Widen the inspector, restart, confirm both widths.
- Right-click a nested folder: New folder, Rename, Delete, Tag contents, Set Creator. Set Creator with subfolders on and off, and confirm a sibling folder is unchanged.
- Import a folder that contains a new STL, a duplicate STL, and a `.txt`. On the finish dialog, set a creator and two tags. Keep originals. The new STL has the creator and tags. The duplicate’s existing creator and tags are unchanged. The `.txt` is still in the source folder.
- Repeat an import and choose Move to Recycle Bin. The imported original is gone. The `.txt` remains. The source folder remains.
- Grid: import `oni_clan_no_thumb.jpg` and `rodburg_no_thumb.png`. After the preview delay, both tiles show the picture, not the letters PNG/JPG. Restart and confirm the thumbs are still there. A previously `unavailable` image of the same kind is retried.
- Drag a short STL onto a slicer. It opens. Drag an STL whose full library path is longer than 260 characters. It opens. Drag a file whose name contains spaces. Drag two files at once. Drag a hard-linked import.
- Force a drag failure (unplug the volume, or use a path the staging copy cannot write) and use Show in Explorer from the failure UI.
- Drop a folder from Explorer onto the app. It still imports.
- `cargo llvm-cov` HTML and `vitest --coverage` HTML were produced locally. `cancel_stops_after_current_file` passed repeatedly.
