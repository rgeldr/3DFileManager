---
name: Unit test coverage gaps
overview: Close the unit test gaps found by the graph-coverage skill and confirmed by Vitest line coverage, starting with path safety and data integrity in Rust, then the untested React hooks, small components, and the api/command contract.
todos:
  - id: vitest-coverage-scope
    content: Widen Vitest coverage.include to all of src so npm run test:unit reports the real baseline
    status: completed
  - id: rust-path-containment
    content: Test contained_library_dir and catalog_file_path (folder/file path escape checks)
    status: completed
  - id: rust-rendered-thumb
    content: Extract store_rendered_thumb from save_rendered_thumb and test it, plus png_from_bytes
    status: completed
  - id: rust-db-gaps
    content: Test rename_folder_with, settings setters via bootstrap, remove_missing, list_tags
    status: completed
  - id: rust-settings-defaults
    content: Test that Settings deserializes old or partial JSON with the serde defaults
    status: completed
  - id: rust-indirect-hotspots
    content: Direct edge-case tests for unique_file_path, unique_dir_name, decode_rle15, migrate
    status: completed
  - id: ts-pure-helpers
    content: Test libraryTypes helpers, isThemeName, readStoredTheme
    status: completed
  - id: ts-small-hooks
    content: Test useSelection, useKeyboardShortcuts, useThumbPump
    status: completed
  - id: ts-use-library
    content: Fix the flaky passive-refresh test, then cover useLibrary in-flight dedupe, stale results, truncation, runDiskOp dialog/toast/error paths, goHistory
    status: completed
  - id: ts-session-effects
    content: Cover the remaining useSessionEffects effects (outside-click close, file counts, resize, restore flow)
    status: completed
  - id: ts-small-components
    content: Render tests for the untested dialogs, Toast, UpdateBanner
    status: completed
  - id: ts-api-contract
    content: Contract test that every api.ts invoke name is registered in lib.rs generate_handler
    status: completed
  - id: ts-partial-components
    content: Extend Sidebar and Viewer tests to cover their uncovered branches
    status: completed
  - id: rerun-and-record
    content: Re-run graph coverage and Vitest coverage, record before/after numbers in this plan
    status: completed
isProject: false
---

# Unit test coverage gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Use superpowers:test-driven-development where a task adds or extracts production code.

**Goal:** Add unit tests where the code has none, ordered by risk: path safety and catalog integrity first, then the React hooks that hold most of the app state, then small components and the TypeScript/Rust command contract.

**Architecture:** No new test infrastructure. Rust tests follow the existing pattern: plain functions that take `&AppDb` / `&Mutex<AppDb>` and closures, tested from `include!`d `tests_*.rs` files or inline `mod tests`. Tauri commands that take an `AppHandle` stay untested. Where a command has real logic inline, move that logic into a plain function first (as was done for `recycle_and_drop_files`). TypeScript tests use Vitest + `@testing-library/react` (`render`, `renderHook`, `fireEvent`, no user-event), with `vi.mock("../api")` like `useThumbQueueCount.test.ts`.

**Tech Stack:** Tauri 2 (Rust, rusqlite), React 19 + TypeScript, Vitest 5 + jsdom + @testing-library/react, `@vitest/coverage-v8`.

## Baseline (Oct 27, 2026, after merging `cursor/graph-coverage-hotspots-509d`)

That merge (commit `b0bcbb5`) added tests for `App`, `useLibrary`, `useSessionEffects`, `useFileDrag`, `usePreviewSplitter`, `MenuBar`, `FilterPopover`, and more cases for `FileGrid`, `TagFilter`, and `TypeFilter`. This plan was trimmed to what is still open.

From the personal graph-coverage skill (`node "$env:USERPROFILE\.cursor\skills\graph-coverage\scripts\graph-coverage.mjs" --summary`, run from the repo root). This is static name-mention linkage, not executed coverage:

| Criterion | Initial (before merge) | Current |
| --- | --- | --- |
| Node, direct (named symbols mentioned by a test) | 287 / 687 (41.8%) | 336 / 687 (48.9%) |
| Node, transitive (also reached by calls from tested symbols) | 492 / 687 (71.6%) | 573 / 687 (83.4%) |
| Edge (cfg edges in test-linked functions) | 2301 / 5566 (41.3%) | 3404 / 5566 (61.2%) |
| Symbols no test reaches, even indirectly | 195 | 114 |

From Vitest v8 over all of `src/` (executed):

| | Initial | Current |
| --- | --- | --- |
| Lines | 44.2% (1333/3017) | 62.8% (1894/3017) |
| Branches | 44.5% | 56.3% |
| Tests | 40 files, 185 tests | 47 files, 210 tests |

**Known flaky test:** `src/hooks/useLibrary.test.tsx` › "skips a passive refresh when the list key is unchanged" failed 1 of 3 runs (expected 1 `listFiles` call, got 2). Task 9 fixes it first.

**Where the static graph over-reports:** the small dialogs count as "reached" because `AppShell` renders them, and `api.*` methods count as covered because test mocks name them. Vitest shows both at 0–2%, so trust Vitest for those files.

## Gap summary

**Rust: untested and not reached from any test**

- Path safety: `commands/open.rs` `contained_library_dir` (guards `reveal_folder`) and `catalog_file_path`. The file version, `contained_library_file`, already has tests. The folder version has none.
- Thumbnails: the inline logic in `commands/thumbs.rs` `save_rendered_thumb` (empty sha, invalid PNG), and `preview.rs` `png_from_bytes`.
- DB layer: `db/folders.rs` `rename_folder_with` (renames on disk and rewrites relpaths). `db/setup.rs`: the five settings setters (`bootstrap` is now reached, but has no direct test). `db/thumbs.rs` `remove_missing`. `db/tags.rs` `list_tags`.
- Settings: every `settings.rs` serde default function (`default_sidebar_width` and the rest). These decide what an older settings row loads as.
- Reached only through import/flow tests, with no edge-case test of their own: `names.rs` `unique_file_path` / `unique_dir_name`, `ctb.rs` `decode_rle15`, `db/schema.rs` `migrate`.

**TypeScript: 0% executed lines**

- Components: `UpdateBanner`, `DeleteFolderDialog`, `DiskProgressDialog`, `DragFailureDialog`, `ErrorDialog`, `ImportProgressDialog`, `MissingFilesDialog`, `NamePromptDialog`, `Toast`.
- Pure helpers with no direct test: `hooks/libraryTypes.ts` (77.8% lines, run only indirectly; `formatBytes` boundaries and the `fallbackDragIconPath` retry are untested), `theme/themes.ts` `isThemeName`, `theme/ThemeProvider.tsx` `readStoredTheme`.
- `api.ts` at 1.7%: 44 thin `invoke` wrappers. The risk is a command name drifting from `lib.rs`. Wrapper bodies are not the risk.

**TypeScript: low coverage** (lines / branches):

| File | Lines | Branches | Notes |
| --- | --- | --- | --- |
| `hooks/useSelection.ts` | 19% | 22% | Only mounted by `App.test.tsx`. No selection mode is exercised. |
| `hooks/useKeyboardShortcuts.ts` | 23% | 0% | The Delete key handler never runs. |
| `components/Viewer.tsx` | 24% | 37% | |
| `components/Sidebar.tsx` | 42% | 20% | Second-highest hotspot. |
| `hooks/useSessionEffects.ts` | 53% | 31% | The merge covers theme/About wiring, bootstrap error, and Escape on the file menu. |
| `hooks/useThumbPump.ts` | 56% | 30% | Highest-connectivity symbol with no direct test (48 downstream symbols). |
| `hooks/useLibrary.ts` | 72% | 52% | The merge covers the passive skip, the busy guard, import tree reload, and Open containing folder. |

**Now covered by the merge, removed from this plan:** `useFileDrag` (81% lines), `useLibraryEffects` (100%), `MenuBar` (95%), `TagFilter` including `TagChips` (92%), `FileGrid` (87.5%), `lib/tagFilter.ts` `sortFromDropdown` (98%).

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
| `src/theme/themes.test.ts` (new) | `isThemeName`, `readStoredTheme`. |
| `src/hooks/useSelection.test.ts` (new) | Selection modes. |
| `src/hooks/useKeyboardShortcuts.test.ts` (new) | Delete key routing. |
| `src/hooks/useThumbPump.test.ts` (new) | Thumbnail job loop. |
| `src/hooks/useLibrary.test.tsx` (extend) | Fix the flaky test. Add `refreshLists`, `runDiskOp`, and `goHistory` cases. |
| `src/hooks/useSessionEffects.test.ts` (extend) | Effects listed in Task 10. |
| `src/components/**/X.test.tsx` (new, one per component) | Small component render tests. |
| `src/api.test.ts` (new) | Command name contract test. |
| `src/components/{Viewer,Sidebar}.test.tsx` (extend) | Uncovered branches. |

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
  Expected: 47 files and 210 tests pass. The coverage table lists every `src/` file. The "All files" line reads about 63% lines.
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

**Files:** Create `src/hooks/libraryTypes.test.ts` and `src/theme/themes.test.ts`.

- [ ] **Step 1:** `libraryTypes.test.ts`:
  - `formatBytes`: `0` → `"0 B"`, `1023` → `"1023 B"`, `1024` → `"1.0 KB"`, `10 * 1024` → `"10 KB"`, `1024 ** 2 * 1.5` → `"1.5 MB"`, and `1024 ** 5` stays in `"TB"`.
  - `formatErrorForDisplay`: a message of length `ERROR_MESSAGE_MAX` is unchanged. One character longer is truncated and ends with `"…(truncated)"`.
  - `emptyProgress()` returns a fresh object each call.
  - `fallbackDragIconPath` (mock `../api` `dragIconPath`): two calls share one request. After a rejection, the next call retries. Use `vi.resetModules()` between cases, because the cache is module state.
- [ ] **Step 2:** `themes.test.ts`: `isThemeName("dark")` and `isThemeName("light")` are true, while `"blue"`, `""`, and `null` are false. For `readStoredTheme` (exported from `ThemeProvider.tsx`), `localStorage` with a valid theme returns it, an invalid value falls back, and a throwing `localStorage.getItem` falls back.
- [ ] **Step 3:** `npx vitest run src/hooks/libraryTypes.test.ts src/theme`. Expected: PASS.
- [ ] **Step 4:** Commit.

---

### Task 8: Small hooks

**Files:** Create `src/hooks/useSelection.test.ts`, `useKeyboardShortcuts.test.ts`, `useThumbPump.test.ts`.

These hooks only run today because `App.test.tsx` and `useLibrary.test.tsx` mount them (19%, 23%, and 56% of lines). Test them directly.

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
- [ ] **Step 4:** `npx vitest run src/hooks`. Expected: PASS.
- [ ] **Step 5:** Commit.

---

### Task 9: `useLibrary` core behavior

**Files:** Modify `src/hooks/useLibrary.test.tsx` (added by the merge; reuse its `api` mock, `wrapper`, and `mockCatalog` helpers).

Already covered by the merge: the passive refresh skip (flaky, fixed in Step 1), the `runDiskOp` busy guard, the tree reload after an import, and Open containing folder clearing filters.

- [ ] **Step 1: Fix the flaky test.** In "skips a passive refresh when the list key is unchanged" (line 107), the count is taken as soon as `ready` is true, but the mount-time `refreshLists` may still be in flight or not yet started. Before reading `calls`, wait for the initial refresh to settle: `await waitFor(() => expect(api.listFiles).toHaveBeenCalled())`, then flush pending work with `await act(async () => {})`. Run `npx vitest run src/hooks/useLibrary.test.tsx` 10 times in a row (for example `1..10 | % { npx vitest run src/hooks/useLibrary.test.tsx }`). Expected: 10 passes.
- [ ] **Step 2: In-flight dedupe.** Two non-passive calls with the same arguments while the first is in flight (hold `listFiles` with a deferred promise) make one `api.listFiles` call and share its promise.
- [ ] **Step 3: Stale results are dropped.** Start refresh A (with `listFiles` held by a deferred promise), then start refresh B with a different query. Resolve B, then A. `files` equals B's rows.
- [ ] **Step 4: Truncation.** When `listFiles` returns `limit + 1` rows, `files` has `limit` rows and `listTruncated` is `true`. Use the limit from `librarySearchLimit`.
- [ ] **Step 5: `runDiskOp` timing and errors.**
  - An op that finishes before 300 ms shows no disk dialog and no toast.
  - An op that runs longer than 300 ms (fake timers) shows the dialog with the title, then a success toast. If it returns `{ cancelled: true }`, the toast is the cancelled message.
  - When `run` rejects, the error is set, the dialog is closed, and `refreshLists` still runs.
- [ ] **Step 6: `goHistory`.** Back and forward move between visited folders, and skip a folder id that no longer exists in `folders`.
- [ ] **Step 7:** `npx vitest run src/hooks/useLibrary.test.tsx`. Expected: PASS. Target: `useLibrary.ts` above 85% lines (72% now).
- [ ] **Step 8:** Commit.

---

### Task 10: Remaining `useSessionEffects` effects

**Files:** Modify `src/hooks/useSessionEffects.test.ts` (added by the merge; reuse its setup).

Already covered by the merge: `actions.current.setTheme` / `showAbout` wiring, `ready` after a bootstrap error, and Escape closing the file menu. `useSessionEffects.ts` is at 53% lines / 31% branches.

- [ ] **Step 1:** Run `npx vitest run --coverage --coverage.include=src/hooks/useSessionEffects.ts --coverage.reporter=html` and open `coverage/index.html` to see which of the 12 `useEffect` blocks (lines 92, 104, 209, 215, 234, 285, 293, 299, 308, 323, 338, 357) are still unexecuted.
- [ ] **Step 2:** Add one focused test per remaining effect with observable behavior, at minimum:
  - The file menu closes on a pointer-down outside it (effect at line 338; Escape is already tested).
  - The creator / folder-tag file counts call `api.countFilesForScope` / `api.addTagsUnderFolder(id, [])` for folder targets, use `fileIds.length` for file targets, and reset to `null` when the target clears (effects around lines 308 and 323).
  - The resize effect (line 299) updates its state on `window` `resize`.
  - The restore flow (line 104, `runRestore`): the success path and the error path.
  Skip effects that only call `debugLog`.
- [ ] **Step 3:** `npx vitest run src/hooks/useSessionEffects.test.ts`. Expected: PASS. Target: above 75% lines and 60% branches.
- [ ] **Step 4:** Commit.

---

### Task 11: Small components

**Files:** Create one `*.test.tsx` next to each component, matching the existing convention: `UpdateBanner`, `dialogs/DeleteFolderDialog`, `dialogs/DiskProgressDialog`, `dialogs/DragFailureDialog`, `dialogs/ErrorDialog`, `dialogs/ImportProgressDialog`, `dialogs/MissingFilesDialog`, `dialogs/NamePromptDialog`, `dialogs/Toast`. All are at 0% executed lines; `App.test.tsx` mounts the shell without opening them.

For each one, build a minimal `LibraryModel` stub, as in `CreatorDialog.test.tsx` (`{ ... } as unknown as LibraryModel`), and assert:

- [ ] It renders nothing when its target or state is `null`.
- [ ] It renders the key text when open (title, file name, counts, progress `current/total`, and `formatBytes` output for disk progress).
- [ ] Each button calls the right setter or `api` method. Confirm buttons call through, and Cancel clears the target.
- [ ] `NamePromptDialog`: Enter submits, a blank name keeps the submit button disabled (if it is), and Escape or Cancel closes it.
- [ ] `DiskProgressDialog`: the Cancel button appears only when `cancellable`, and it calls `api.cancelDiskOp`.
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

**Files:** Modify `src/components/Sidebar.test.tsx` and `src/components/Viewer.test.tsx`. (`FileGrid` at 87.5% and `TagFilter` at 92% were raised by the merge and are dropped from this task.)

- [ ] **Step 1:** Run `npx vitest run --coverage --coverage.reporter=html` and open `coverage/index.html`. For `Sidebar.tsx` (42% lines / 20% branches) and `Viewer.tsx` (24% / 37%), list the uncovered branches.
- [ ] **Step 2:** Add tests for the uncovered branches that are user-visible: empty and error states, keyboard handling, folder context-menu entry points, drag-over and drop targets in `Sidebar`, and `Viewer`'s `TextPreview` path. Skip branches that need WebGL.
- [ ] **Step 3:** Target at least 70% lines for `Sidebar` and 50% for `Viewer`. Note any branch you deliberately skip, and why, in the commit message.
- [ ] **Step 4:** Commit.

---

### Task 14: Re-run and record

- [ ] **Step 1:** From the repo root, run `node "$env:USERPROFILE\.cursor\skills\graph-coverage\scripts\graph-coverage.mjs" --summary --out "$env:TEMP\graph-coverage.json"` (or the repo copy, `node .cursor/skills/graph-coverage/scripts/graph-coverage.mjs`, which gives the same result). Read `metrics.nodeCoverage`, `metrics.edgeCoverage`, and the `metrics.untested` entries with `reachedFromTest: false`.
- [ ] **Step 2:** Run `npm run test:unit` (now covering all of `src/` after Task 1) and `cargo test` (from `src-tauri`).
- [ ] **Step 3:** Add an "After" column to both Baseline tables. Expected direction: direct node coverage well above 48.9%, unreached symbols well below 114, Vitest lines well above 62.8%, and no remaining unreached Rust symbols outside the Out of scope list.

---

## Out of scope

- **`drag_win.rs`** (17 COM `IDataObject`/`IDropSource` methods) and **`drag_session.rs`**. These need an OLE STA thread and a real drag, and they are covered by the manual drag checks.
- **Tauri command wrappers that only lock the DB and delegate** (`commands/settings.rs` setters, `list_tags`, `bootstrap`, `cancel_import`, `cancel_disk_op`, `rescan_*`, `export_library_backup`, `restore_library_backup`, `reveal_*`, `open_in_default_app`, `drag_icon_path`, `debug_log`). Their logic is tested at the DB, backup, and rescan layer. Task 12 catches name drift on the TypeScript side.
- **Deeper `App.tsx` / `AppShell` tests** (9.4% lines). The merge added `App.test.tsx` for the setup screen and the main chrome. Going further would mean mocking nearly every API and plugin, so cover it through the hooks it composes (Tasks 8 to 10). An end-to-end harness would be a separate project.
- **WebGL and Worker rendering** (`renderThumb.ts`, `meshParseClient.ts`, `meshParse.worker.ts`), pending the decision above.
- **`debugLog.ts` `installDebugProbes`.** This is diagnostic wiring with no user-facing behavior.
- **Coverage thresholds in CI**, pending the decision above.
