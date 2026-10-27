---
name: Unit test coverage gaps
overview: Close the unit test gaps found by the graph-coverage skill and confirmed by Vitest line coverage, starting with path safety and data integrity in Rust, then the untested React hooks, small components, and the api/command contract.
todos:
  - id: vitest-coverage-scope
    content: Widen Vitest coverage.include to all of src so npm run test:unit reports the real baseline
    status: pending
  - id: rust-path-containment
    content: Test contained_library_dir and catalog_file_path (folder/file path escape checks)
    status: pending
  - id: rust-rendered-thumb
    content: Extract store_rendered_thumb from save_rendered_thumb and test it, plus png_from_bytes
    status: pending
  - id: rust-db-gaps
    content: Test rename_folder_with, settings setters via bootstrap, remove_missing, list_tags
    status: pending
  - id: rust-settings-defaults
    content: Test that Settings deserializes old or partial JSON with the serde defaults
    status: pending
  - id: rust-indirect-hotspots
    content: Direct edge-case tests for unique_file_path, unique_dir_name, decode_rle15, migrate
    status: pending
  - id: ts-pure-helpers
    content: Test libraryTypes helpers, sortFromDropdown, isThemeName, readStoredTheme
    status: pending
  - id: ts-small-hooks
    content: Test useSelection, useKeyboardShortcuts, useThumbPump, useLibraryEffects
    status: pending
  - id: ts-use-library
    content: Test useLibrary refreshLists dedupe/stale results, runDiskOp, goHistory
    status: pending
  - id: ts-session-and-drag
    content: Test useSessionEffects effects and useFileDrag pointer flow
    status: pending
  - id: ts-small-components
    content: Render tests for the untested dialogs, Toast, UpdateBanner, MenuBar, TagChips
    status: pending
  - id: ts-api-contract
    content: Contract test that every api.ts invoke name is registered in lib.rs generate_handler
    status: pending
  - id: ts-partial-components
    content: Extend Viewer, Sidebar, TagFilter, FileGrid tests to cover their uncovered branches
    status: pending
  - id: rerun-and-record
    content: Re-run graph coverage and Vitest coverage, record before/after numbers in this plan
    status: pending
isProject: false
---

# Unit test coverage gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Use superpowers:test-driven-development where a task adds or extracts production code.

**Goal:** Add unit tests where the code has none, ordered by risk: path safety and catalog integrity first, then the React hooks that hold most of the app state, then small components and the TypeScript/Rust command contract.

**Architecture:** No new test infrastructure. Rust tests follow the existing pattern: plain functions that take `&AppDb` / `&Mutex<AppDb>` and closures, tested from `include!`d `tests_*.rs` files or inline `mod tests`. Tauri commands that take an `AppHandle` stay untested. Where a command has real logic inline, move that logic into a plain function first (as was done for `recycle_and_drop_files`). TypeScript tests use Vitest + `@testing-library/react` (`render`, `renderHook`, `fireEvent`, no user-event), with `vi.mock("../api")` like `useThumbQueueCount.test.ts`.

**Tech Stack:** Tauri 2 (Rust, rusqlite), React 19 + TypeScript, Vitest 5 + jsdom + @testing-library/react, `@vitest/coverage-v8`.

## Baseline (Oct 27, 2026)

From `node .cursor/skills/graph-coverage/scripts/graph-coverage.mjs --summary` (static name-mention linkage, not executed coverage):

| Criterion | Covered | Total | Ratio |
| --- | --- | --- | --- |
| Node, direct (named symbols mentioned by a test) | 287 | 687 | 41.8% |
| Node, transitive (also reached by calls from tested symbols) | 492 | 687 | 71.6% |
| Edge (cfg edges in test-linked functions) | 2301 | 5566 | 41.3% |

From Vitest v8 over all of `src/` (executed): **44.2% lines (1333/3017), 44.5% branches**. 40 files, 185 tests, all passing.

The two sources agree on the TypeScript gaps. Every file below listed at 0% is also marked "no test reaches it" by the static graph.

## Gap summary

**Rust: untested and not reached from any test**

- Path safety: `commands/open.rs` `contained_library_dir` (guards `reveal_folder`) and `catalog_file_path`. The file version, `contained_library_file`, already has tests. The folder version has none.
- Thumbnails: the inline logic in `commands/thumbs.rs` `save_rendered_thumb` (empty sha, invalid PNG), and `preview.rs` `png_from_bytes`.
- DB layer: `db/folders.rs` `rename_folder_with` (renames on disk and rewrites relpaths). `db/setup.rs` `bootstrap` and the five settings setters. `db/thumbs.rs` `remove_missing`. `db/tags.rs` `list_tags`.
- Settings: every `settings.rs` serde default function (`default_sidebar_width` and the rest). These decide what an older settings row loads as.
- Reached only through import/flow tests, with no edge-case test of their own: `names.rs` `unique_file_path` / `unique_dir_name`, `ctb.rs` `decode_rle15`, `db/schema.rs` `migrate`.

**TypeScript: 0% executed lines**

- Hooks: `useLibrary` (272 lines), `useSessionEffects` (150), `useFileDrag` (123), `useThumbPump` (39), `useKeyboardShortcuts` (22), `useSelection` (21), `useLibraryEffects` (7).
- Components: `MenuBar`, `UpdateBanner`, `DeleteFolderDialog`, `DiskProgressDialog`, `DragFailureDialog`, `ErrorDialog`, `ImportProgressDialog`, `MissingFilesDialog`, `NamePromptDialog`, `Toast`, and `TagChips` in `TagFilter.tsx`.
- Pure helpers with no test: `hooks/libraryTypes.ts` (`formatBytes`, `formatErrorForDisplay`, `fallbackDragIconPath`, `emptyProgress`), `lib/tagFilter.ts` `sortFromDropdown`, `theme/themes.ts` `isThemeName`, `theme/ThemeProvider.tsx` `readStoredTheme`.
- `api.ts` at 1.7%: 44 thin `invoke` wrappers. The risk is a command name drifting from `lib.rs`. Wrapper bodies are not the risk.

**TypeScript: partially covered** (lines / branches): `Viewer.tsx` 24% / 37%, `TagFilter.tsx` 41% / 21%, `Sidebar.tsx` 42% / 20%, `FileGrid.tsx` 59% / 49%.

## Decisions to confirm with Jason

- **Extract-to-test in Rust.** Task 3 moves the `save_rendered_thumb` body into a plain function. This is a small production change, and it follows the `recycle_and_drop_files` precedent. Is that OK?
- **Coverage thresholds.** Task 1 only widens `coverage.include`. Adding `coverage.thresholds` (for example `lines: 60`) would make CI fail on regressions. This plan leaves thresholds out unless you want them.
- **Thumbnail renderer.** `lib/renderThumb.ts`, `lib/meshParseClient.ts`, and `workers/meshParse.worker.ts` (270 lines total, 0%) need WebGL or a Worker. Their pure geometry helpers (`fitCamera`, `groupFromPackedMeshes`, `packGeometry`, `collectMeshes`) are not exported. This plan leaves them out (see Out of scope). Exporting them for tests would be a follow-up.

## Global Constraints

- Test names describe behavior, matching the existing style (`fn contained_library_file_stays_inside_the_root`, `it("polls and updates when the count changes")`).
- Rust tests create scratch data under `std::env::temp_dir()` with a unique name containing `std::process::id()`, and remove it at the end. Inside `db/tests_*.rs`, use `scratch_db(name)` from `db/tests_support.rs`.
- Files pulled in with `include!` inside `mod tests` keep the 4-space indent.
- Tests must not touch the real library, settings, or network. Mock `../api` in hooks and components. Do not call `invoke` for real.
- Rust builds on this machine use the GNU toolchain with MinGW. Before running `cargo` directly in PowerShell, run:
  `$env:PATH = "$HOME\mingw\winlibs\mingw64\bin;$env:PATH"; $env:CC = "x86_64-w64-mingw32-gcc"`
- Every task ends green: `cargo test` (from `src-tauri`) and `npm run test:unit`.

## File map

| File | Change |
| --- | --- |
| `vitest.config.ts` | Widen `coverage.include` to `src/**/*.{ts,tsx}` and exclude tests and `.d.ts` files. |
| `src-tauri/src/commands/tests_open.rs` | `contained_library_dir` and `catalog_file_path` tests. |
| `src-tauri/src/commands/thumbs.rs` | Extract `store_rendered_thumb`. `save_rendered_thumb` delegates to it. |
| `src-tauri/src/commands/tests_thumbs.rs` | `store_rendered_thumb` tests. |
| `src-tauri/src/preview.rs` (`mod tests`) | `png_from_bytes` tests. |
| `src-tauri/src/db/tests_folders.rs` | `rename_folder_with` tests. |
| `src-tauri/src/db/tests_setup.rs` (new, `include!` in `db/mod.rs`) | Settings setters, `bootstrap`, `list_tags`, `remove_missing`. |
| `src-tauri/src/settings.rs` (`mod tests`) | Serde default tests. |
| `src-tauri/src/names.rs` (`mod tests`) | `unique_file_path` / `unique_dir_name` tests. |
| `src-tauri/src/ctb.rs` (`mod tests`) | `decode_rle15` tests. |
| `src-tauri/src/db/mod.rs` (`mod tests`) | `migrate` test on an old-schema database. |
| `src/hooks/libraryTypes.test.ts` (new) | Pure helper tests. |
| `src/lib/tagFilter.test.ts` | `sortFromDropdown`. |
| `src/theme/themes.test.ts` (new) | `isThemeName`, `readStoredTheme`. |
| `src/hooks/useSelection.test.ts` (new) | Selection modes. |
| `src/hooks/useKeyboardShortcuts.test.ts` (new) | Delete key routing. |
| `src/hooks/useThumbPump.test.ts` (new) | Thumbnail job loop. |
| `src/hooks/useLibraryEffects.test.ts` (new) | Effect wiring. |
| `src/hooks/useLibrary.test.ts` (new) | `refreshLists`, `runDiskOp`, `goHistory`. |
| `src/hooks/useSessionEffects.test.ts` (new) | Effects listed in Task 10. |
| `src/hooks/useFileDrag.test.ts` (new) | Pointer drag flow. |
| `src/components/**/X.test.tsx` (new, one per component) | Small component render tests. |
| `src/api.test.ts` (new) | Command name contract test. |
| `src/components/{Viewer,Sidebar,TagFilter,FileGrid}.test.tsx` | Extend for uncovered branches. |

---

### Task 1: Measure all of `src/`

**Files:** Modify `vitest.config.ts`.

Today `coverage.include` lists 11 files, so `npm run test:unit` reports high numbers that hide the 0% files.

- [ ] **Step 1:** Replace the `coverage.include` array with:

```ts
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/*.d.ts", "src/main.tsx"],
```

- [ ] **Step 2:** Run `npm run test:unit`.
  Expected: 40 files and 185 tests pass. The coverage table lists every `src/` file. The "All files" line reads about 44% lines.
- [ ] **Step 3:** Commit: `git commit -am "Measure unit test coverage across all of src"`

---

### Task 2: Folder and file path containment (Rust, security)

**Files:** Test `src-tauri/src/commands/tests_open.rs`.

**Interfaces (existing):** `contained_library_dir(root: &Path, relpath: &str) -> Result<PathBuf, String>`, `catalog_file_path(db: &AppDb, file_id: i64) -> Result<PathBuf, String>`.

- [ ] **Step 1:** Add `contained_library_dir_stays_inside_the_root`. Model it on `contained_library_file_stays_inside_the_root`. Assert:
  - `""` resolves to the canonical root.
  - `"Models"` resolves to `root/Models`.
  - `"../outside"`, `"Models/../../outside"`, and an absolute path to a sibling dir all return `Err` containing "outside".
  - `"Models/missing"` returns `Err` containing "missing".
  - A relpath that names a file (`"Models/guide.pdf"`) returns `Err`, because it is not a directory.
  - A relpath containing `'\0'` returns `Err`.
  - `#[cfg(unix)]`: a symlinked dir pointing outside the root returns `Err`.
- [ ] **Step 2:** Add `catalog_file_path_rejects_a_row_outside_the_library`. Insert a row with `stored_relpath = "../secret.stl"` (as in `trash_items_rejects_a_path_outside_the_library`) and assert `catalog_file_path` returns `Err`. A normal row returns the canonical file path.
- [ ] **Step 3:** Run `cargo test contained_library` and `cargo test catalog_file_path`. Expected: PASS. No production change is expected. If a case fails, stop and report it, because that is a real path-escape bug.
- [ ] **Step 4:** Commit.

---

### Task 3: Saving a rendered thumbnail (Rust)

**Files:** Modify `src-tauri/src/commands/thumbs.rs`. Test `src-tauri/src/commands/tests_thumbs.rs` and `src-tauri/src/preview.rs` (`mod tests`).

**Interfaces:** Produces `fn store_rendered_thumb(db: &AppDb, id: i64, png: &[u8]) -> Result<(), String>`, containing exactly the current body of the `save_rendered_thumb` closure. The command becomes:

```rust
    off_ui("save_rendered_thumb", move || {
        let db = thumbs.lock().map_err(|e| e.to_string())?;
        store_rendered_thumb(&db, id, &png)
    })
```

- [ ] **Step 1: Write the failing tests** in `tests_thumbs.rs`:
  - `rendered_thumb_for_an_unhashed_file_is_marked_unhashed`: insert a file with sha `""`, call `store_rendered_thumb` with valid PNG bytes, and assert the thumb status is `"unhashed"` and no file was written under `thumbs/`.
  - `rendered_thumb_that_is_not_a_png_is_marked_unavailable`: pass `b"not a png"` and assert status `"unavailable"`.
  - `rendered_thumb_is_written_and_marked_ok`: valid PNG (encode a 2x2 `image::RgbaImage`). Assert `db::thumb_path(&db.data_dir, sha)` exists and the status is `"ok"`.
  - Read status with `SELECT thumb_status FROM files WHERE id = ?1` (as in `status_of` in `db/tests_support.rs`).
- [ ] **Step 2:** `cargo test rendered_thumb`. Expected: compile error, `store_rendered_thumb` not found.
- [ ] **Step 3:** Extract the function and make the command delegate to it.
- [ ] **Step 4:** In `preview.rs` `mod tests`, add `png_from_bytes_accepts_a_png_and_rejects_garbage`. A valid PNG returns `Some`, and `b""` and `b"GIF89a"` return `None`.
- [ ] **Step 5:** `cargo test rendered_thumb png_from_bytes`, then `cargo check --all-targets`. Expected: PASS, no warnings.
- [ ] **Step 6:** Commit.

---

### Task 4: DB layer gaps (Rust)

**Files:** Test `src-tauri/src/db/tests_folders.rs`. Create `src-tauri/src/db/tests_setup.rs` and add `include!("tests_setup.rs");` to `mod tests` in `src-tauri/src/db/mod.rs` (before `tests_support.rs`).

- [ ] **Step 1:** `rename_folder_with_moves_the_directory_and_rewrites_paths` in `tests_folders.rs`:
  - Create folder `Minis` with a file `Minis/a.stl` on disk and in the catalog.
  - Call `rename_folder_with(id, "Terrain", &AtomicBool::new(false), |p| events.push(p))`.
  - Assert it returns `Ok(false)`, `root/Terrain/a.stl` exists, `root/Minis` is gone, `folder_relpath(id) == "Terrain"`, and the file's `stored_relpath` starts with `Terrain/`.
- [ ] **Step 2:** `rename_folder_with_picks_a_unique_name_on_collision`: an existing sibling dir `Terrain` means the renamed folder gets the name `unique_dir_name` returns. Assert the folder row and the disk agree.
- [ ] **Step 3:** `rename_folder_with_honours_cancel`: with `cancel` already set to `true`, assert it returns `Ok(true)` and the catalog paths are unchanged. Confirm the actual cancel behavior by reading `relocate_folder` before writing the assertion.
- [ ] **Step 4:** In `tests_setup.rs`:
  - `settings_setters_round_trip_through_bootstrap`: call `set_pane_widths(300, 280)`, `set_preview_height(222)`, `set_inspector_pinned(true)`, `set_sidebar_pinned(false)`, and `set_details_columns(...)`. Then assert `bootstrap().settings` reflects each value.
  - `bootstrap_reports_folders_and_missing_count`: create one folder and one missing file, and assert `folders.len()` and `missing_count`.
  - `list_tags_returns_each_tag_once_sorted`.
  - `remove_missing_drops_only_missing_rows`. Use `db/thumbs.rs` `remove_missing`.
- [ ] **Step 5:** `cargo test rename_folder_with settings_setters bootstrap_reports list_tags_returns remove_missing_drops`. Expected: PASS.
- [ ] **Step 6:** Commit.

---

### Task 5: Settings defaults for older settings rows (Rust)

**Files:** Test `src-tauri/src/settings.rs` (`mod tests`).

- [ ] **Step 1:** `missing_fields_load_with_their_defaults`: `serde_json::from_str::<Settings>("{}")`. If `{}` is rejected, use the smallest JSON an older version wrote. Assert each `#[serde(default = ...)]` field equals its `default_*()` function: sidebar width, inspector width, preview height, thumb retry (`0`), inspector pinned, sidebar pinned, search scope, details columns.
- [ ] **Step 2:** `unknown_fields_are_ignored`: JSON with an extra key still parses. Skip this if the struct uses `deny_unknown_fields`, and note why in the test name.
- [ ] **Step 3:** `cargo test settings::tests`. Expected: PASS.
- [ ] **Step 4:** Commit.

---

### Task 6: Direct edge cases for functions only reached through import flows (Rust)

**Files:** Test `src-tauri/src/names.rs`, `src-tauri/src/ctb.rs`, `src-tauri/src/db/mod.rs` (each in its `mod tests`).

- [ ] **Step 1:** `names.rs`:
  - `unique_file_path_numbers_collisions`: an empty dir returns the name unchanged. Then create `a.stl` and assert the next result differs and keeps the `.stl` extension. Create that file too and assert a third distinct name. Read the function first to match its numbering format exactly.
  - `unique_dir_name_numbers_collisions`: the same checks for directories.
- [ ] **Step 2:** `ctb.rs`: `decode_rle15_rejects_truncated_data`. Empty data or data shorter than `width*height` returns `None`. Add `decode_rle15_decodes_a_single_run`: one run covering a 2x2 image yields four pixels of the expected color. Derive the byte layout from the function.
- [ ] **Step 3:** `db/mod.rs`: `migrate_upgrades_an_old_schema_and_is_idempotent`. Create a SQLite file with the oldest `files` / `folders` schema that `migrate` handles (read `schema.rs` for which columns it adds). Open it with `db::open`, assert the added columns exist (`PRAGMA table_info`), then open it again and assert there is no error.
- [ ] **Step 4:** `cargo test unique_ decode_rle15 migrate_`. Expected: PASS.
- [ ] **Step 5:** Commit.

---

### Task 7: Pure TypeScript helpers

**Files:** Create `src/hooks/libraryTypes.test.ts` and `src/theme/themes.test.ts`. Modify `src/lib/tagFilter.test.ts`.

- [ ] **Step 1:** `libraryTypes.test.ts`:
  - `formatBytes`: `0` → `"0 B"`, `1023` → `"1023 B"`, `1024` → `"1.0 KB"`, `10 * 1024` → `"10 KB"`, `1024 ** 2 * 1.5` → `"1.5 MB"`, and `1024 ** 5` stays in `"TB"`.
  - `formatErrorForDisplay`: a message of length `ERROR_MESSAGE_MAX` is unchanged. One character longer is truncated and ends with `"…(truncated)"`.
  - `emptyProgress()` returns a fresh object each call.
  - `fallbackDragIconPath` (mock `../api` `dragIconPath`): two calls share one request. After a rejection, the next call retries. Use `vi.resetModules()` between cases, because the cache is module state.
- [ ] **Step 2:** `themes.test.ts`: `isThemeName("dark")` and `isThemeName("light")` are true, while `"blue"`, `""`, and `null` are false. For `readStoredTheme` (exported from `ThemeProvider.tsx`), `localStorage` with a valid theme returns it, an invalid value falls back, and a throwing `localStorage.getItem` falls back.
- [ ] **Step 3:** `tagFilter.test.ts`: add `sortFromDropdown` cases for each dropdown value and an unknown value.
- [ ] **Step 4:** `npx vitest run src/hooks/libraryTypes.test.ts src/theme src/lib/tagFilter.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit.

---

### Task 8: Small hooks

**Files:** Create `src/hooks/useSelection.test.ts`, `useKeyboardShortcuts.test.ts`, `useThumbPump.test.ts`, `useLibraryEffects.test.ts`.

- [ ] **Step 1: `useSelection`** (use `renderHook` and `act`; `prefetchRef = { current: vi.fn() }`):
  - `replace` selects one id, and `selectedFile` is that row.
  - `toggle` adds an id, and toggling again removes it.
  - `range` from the last selected id selects the inclusive slice in file order, in both directions.
  - `range` with nothing selected, or with an anchor no longer in `files`, falls back to `replace`.
  - `prefetchRef.current` receives the same ids as `selected` every time.
  - `selectedFile` is `null` when 0 or 2+ ids are selected.
- [ ] **Step 2: `useKeyboardShortcuts`** (mock `../api`; dispatch `KeyboardEvent("keydown", { key: "Delete" })` on `window`):
  - With one selected file, `runDiskOp` gets the title `Deleting "<sortName>"...`, and its `run` calls `api.deleteFiles([id])`.
  - With 3 selected, the title is `Deleting 3 files...`.
  - With `dialogOpen` true, a `folderTagTarget`, or a `fileMenu`, nothing happens.
  - With the event target inside the sidebar on a folder, `openDeleteFolderConfirm(folderId)` is called and no file delete happens. Build the DOM so `deleteKeyFocus` / `focusedFolderId` from `lib/deleteKey.ts` return those values, and reuse fixtures from `deleteKey.test.ts`.
  - After unmount, the listener is removed: Delete does nothing.
- [ ] **Step 3: `useThumbPump`** (mock `../api`, `../lib/renderThumb` (`renderMeshStill`, `MESH_BYTE_LIMIT`), `@tauri-apps/api/core` (`convertFileSrc`), and `../debugLog`; use fake timers and advance by 32 ms per loop):
  - `ready: false`, no `libraryRoot`, or `dialogOpen` means `api.nextThumbnail` is never called.
  - A `render` job under the limit calls `renderMeshStill` and then `api.saveRenderedThumb(id, [...bytes])`.
  - A `render` job over `MESH_BYTE_LIMIT` calls `api.markThumbUnavailable(id)`.
  - When `renderMeshStill` rejects, `api.markThumbUnavailable(id)` is called.
  - Bumping `thumbGeneration.current` (unmount, or rerender with a new `thumbNonce`) while a render is in flight calls `api.releaseRenderingThumb(id)`, and the PNG is not saved.
  - After 10 `done` jobs, `refreshListsRef.current` is called. When the queue empties (`null`), it is called once more.
- [ ] **Step 4: `useLibraryEffects`:** read the 38-line file and test its single effect: what triggers it and what it calls.
- [ ] **Step 5:** `npx vitest run src/hooks`. Expected: PASS.
- [ ] **Step 6:** Commit.

---

### Task 9: `useLibrary` core behavior

**Files:** Create `src/hooks/useLibrary.test.ts`.

Read `src/hooks/useLibrary.ts` first. Mock `../api` with every method the hook calls on mount (`bootstrap`, `listFiles`, `listCreators`, `listTagCounts`, `listTypeCounts`, ...), resolving to empty results. Mock any `@tauri-apps/*` imports.

- [ ] **Step 1: `refreshLists` dedupe.** Two calls with the same arguments while the first is in flight make one `api.listFiles` call and share its promise. A `"passive"` call with the key already loaded makes no call.
- [ ] **Step 2: Stale results are dropped.** Start refresh A (with `listFiles` held by a deferred promise), then start refresh B with a different query. Resolve B, then A. `files` equals B's rows.
- [ ] **Step 3: Truncation.** When `listFiles` returns `limit + 1` rows, `files` has `limit` rows and `listTruncated` is `true`. Use the limit from `librarySearchLimit`.
- [ ] **Step 4: `runDiskOp`.**
  - While one op is running, a second sets the error `"Another library change is already running."` and does not call its `run`.
  - An op that finishes before 300 ms shows no disk dialog and no toast.
  - An op that runs longer than 300 ms (fake timers) shows the dialog with the title, then a success toast. If it returns `{ cancelled: true }`, the toast is the cancelled message.
  - When `run` rejects, the error is set, the dialog is closed, and `refreshLists` still runs.
  - `tree: true` calls `api.bootstrap` again after the op.
- [ ] **Step 5: `goHistory`.** Back and forward move between visited folders, and skip a folder id that no longer exists in `folders`.
- [ ] **Step 6:** `npx vitest run src/hooks/useLibrary.test.ts`. Expected: PASS.
- [ ] **Step 7:** Commit.

---

### Task 10: `useSessionEffects` and `useFileDrag`

**Files:** Create `src/hooks/useSessionEffects.test.ts` and `src/hooks/useFileDrag.test.ts`.

- [ ] **Step 1: `useSessionEffects`.** Read the file. It has 12 `useEffect` blocks (lines 92, 104, 209, 215, 234, 285, 293, 299, 308, 323, 338, 357). Write one focused test per effect that has observable behavior, at minimum:
  - The file menu closes on Escape and on a pointer-down outside it (effect at line 338).
  - The creator / folder-tag file counts call `api.countFilesForScope` / `api.addTagsUnderFolder(id, [])` for folder targets, use `fileIds.length` for file targets, and reset to `null` when the target clears (effects around lines 308 and 323).
  - The resize effect (line 299) updates its state on `window` `resize`.
  - The restore flow (line 104, `runRestore`): the success path and the error path.
  Skip effects that only call `debugLog`.
- [ ] **Step 2: `useFileDrag`.** Read the file. Test it through a small harness component that spreads `onPointerDown` onto a container holding `[data-file-id]` tiles. Mock `../api` (`prepareDragPaths`, `startFileDrag`):
  - A pointer-down then pointer-up without moving starts no drag.
  - Moving past the drag threshold calls `api.prepareDragPaths(ids, iconPath)` with the selected ids, then `api.startFileDrag`.
  - Pointer capture is released on pointer-up.
  - A native `dragstart` on the grid is prevented (`blockDrag`).
  - Skipped paths from `prepareDragPaths` reach the failure state that `DragFailureDialog` reads.
- [ ] **Step 3:** `npx vitest run src/hooks`. Expected: PASS.
- [ ] **Step 4:** Commit.

---

### Task 11: Small components

**Files:** Create one `*.test.tsx` next to each component, matching the existing convention: `MenuBar`, `UpdateBanner`, `dialogs/DeleteFolderDialog`, `dialogs/DiskProgressDialog`, `dialogs/DragFailureDialog`, `dialogs/ErrorDialog`, `dialogs/ImportProgressDialog`, `dialogs/MissingFilesDialog`, `dialogs/NamePromptDialog`, `dialogs/Toast`. Add `TagChips` cases to `TagFilter.test.tsx`.

For each one, build a minimal `LibraryModel` stub, as in `CreatorDialog.test.tsx` (`{ ... } as unknown as LibraryModel`), and assert:

- [ ] It renders nothing when its target or state is `null`.
- [ ] It renders the key text when open (title, file name, counts, progress `current/total`, and `formatBytes` output for disk progress).
- [ ] Each button calls the right setter or `api` method. Confirm buttons call through, and Cancel clears the target.
- [ ] `NamePromptDialog`: Enter submits, a blank name keeps the submit button disabled (if it is), and Escape or Cancel closes it.
- [ ] `DiskProgressDialog`: the Cancel button appears only when `cancellable`, and it calls `api.cancelDiskOp`.
- [ ] `MenuBar`: each menu item calls the matching `Actions` callback.
- [ ] Run `npx vitest run src/components`. Expected: PASS. Commit.

---

### Task 12: Command name contract between `api.ts` and `lib.rs`

**Files:** Create `src/api.test.ts`.

The static graph flags 44 `api.*` wrappers as untested. Testing each wrapper body adds little. The real failure is a renamed or unregistered command, which only shows up at runtime.

- [ ] **Step 1:** Mock `@tauri-apps/api/core` `invoke` to record its first argument and resolve `undefined`. Call every function on `api` with placeholder arguments: iterate `Object.entries(api)` and call each with `({} as never)` for each declared parameter (`fn.length`).
- [ ] **Step 2:** Read `src-tauri/src/lib.rs` with `node:fs` (types come from `src/test-node.d.ts`). Extract the identifiers inside `tauri::generate_handler![ ... ]`.
- [ ] **Step 3:** Assert that every recorded command name is in that list. On failure, print the missing names.
- [ ] **Step 4:** Run `npx vitest run src/api.test.ts`. Expected: PASS. If a name is missing, stop and report it, because that is a real bug.
- [ ] **Step 5:** Commit.

---

### Task 13: Partially covered components

**Files:** Modify `src/components/Viewer.test.tsx`, `Sidebar.test.tsx`, `TagFilter.test.tsx`, `FileGrid.test.tsx`.

- [ ] **Step 1:** Run `npx vitest run --coverage --coverage.reporter=html` and open `coverage/index.html`. For each of the four files, list the uncovered branches.
- [ ] **Step 2:** Add tests for the uncovered branches that are user-visible: empty and error states, keyboard handling, context-menu entry points, and `Viewer`'s `TextPreview` path. Skip branches that need WebGL.
- [ ] **Step 3:** Target at least 70% lines for `Sidebar`, `TagFilter`, and `FileGrid`, and 50% for `Viewer`. Note any branch you deliberately skip, and why, in the commit message.
- [ ] **Step 4:** Commit.

---

### Task 14: Re-run and record

- [ ] **Step 1:** Run `node .cursor/skills/graph-coverage/scripts/graph-coverage.mjs --summary --out "$env:TEMP\graph-coverage.json"`. Read `metrics.nodeCoverage`, `metrics.edgeCoverage`, and the `metrics.untested` entries with `reachedFromTest: false`.
- [ ] **Step 2:** Run `npm run test:unit` (now covering all of `src/` after Task 1) and `cargo test` (from `src-tauri`).
- [ ] **Step 3:** Add an "After" table under "Baseline" in this plan, with the same rows plus the Vitest line and branch percentages. Expected direction: direct node coverage well above 41.8%, Vitest lines well above 44%, and no remaining unreached Rust symbols outside the Out of scope list.

---

## Out of scope

- **`drag_win.rs`** (17 COM `IDataObject`/`IDropSource` methods) and **`drag_session.rs`**. These need an OLE STA thread and a real drag, and they are covered by the manual drag checks.
- **Tauri command wrappers that only lock the DB and delegate** (`commands/settings.rs` setters, `list_tags`, `bootstrap`, `cancel_import`, `cancel_disk_op`, `rescan_*`, `export_library_backup`, `restore_library_backup`, `reveal_*`, `open_in_default_app`, `drag_icon_path`, `debug_log`). Their logic is tested at the DB, backup, and rescan layer. Task 12 catches name drift on the TypeScript side.
- **`App.tsx` / `AppShell`** (127 lines, the highest-connectivity node). A useful test would mock nearly every API and plugin. Cover it through the hooks it composes (Tasks 8 to 10). An end-to-end harness would be a separate project.
- **WebGL and Worker rendering** (`renderThumb.ts`, `meshParseClient.ts`, `meshParse.worker.ts`), pending the decision above.
- **`debugLog.ts` `installDebugProbes`.** This is diagnostic wiring with no user-facing behavior.
- **Coverage thresholds in CI**, pending the decision above.
