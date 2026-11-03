Status: plan only, not started

# Folder drag-and-drop move

Planning only. No application code in this change.

**Finding.** On current `main` (`466c131`, version 26.10.38) dragging a folder onto another folder already moves it. The left tree starts the drag, and `move_folder` moves the directory on disk and rewrites the catalog. Rebuilding that pipeline would duplicate `src/components/Sidebar.tsx`, `src-tauri/src/db/folders.rs`, and `src-tauri/src/relocate.rs`.

This plan records how that path works, what a later change should leave alone, and the few gaps worth a small follow-up.

## Assumptions

- One folder per drag. The tree has no multi-select, and file drag already moves several files in one drop.
- Drop targets are folder rows and the library root in the left tree. The file grid, the Downloads row, and anything outside the window are not folder-move targets.
- Folder ids stay stable. Descendant folders and files keep their ids. Only `parent_id`, `name` when a collision renames the folder, `folders.relpath`, and `files.stored_relpath` change.
- No undo. File moves have no undo either. A folder tree can be large, and a second command that reverses a cross-volume copy is a new feature.
- Windows x64, same as the rest of the app. A library on one volume uses rename. A destination that Windows reports as another device uses the existing copy-then-delete fallback.
- This document does not bump the version. A follow-up that changes code in November 2026 runs `npm run version:bump`, which turns 26.10.38 into **26.11.0**.

## What already works

### File drag, and what folder drag reuses

Internal file moves are a pointer gesture in `src/hooks/useFileDrag.ts`, not an HTML5 drop.

1. Pointer down on a `[data-file-id]` tile records the selected ids.
2. Pointer move looks up `[data-folder-id]` under the cursor and stores that key as `dropTarget`. `"root"` is the library root.
3. If the pointer leaves the window, the gesture becomes a native drag-out (`startDrag` from `@crabnebula/tauri-plugin-drag`, mode `copy`) via `prepare_drag_paths`. That path hands real files to another app. It is not a library move.
4. Pointer up inside the window, after the slop and before a native drag starts, calls `api.moveFiles(ids, folderId)`.
5. `Sidebar` paints `.folder-row.drop` from `dropTarget`. After 500ms on a target that has children, that row expands.

Folder drag is a second pointer gesture in `Sidebar`, so a folder drag does not prepare drag-out paths. It reuses the same drop key, the same `.folder-row.drop` outline, and the same 500ms auto-expand. `App.tsx` handles `onMoveFolder` with `runDiskOp`: title `Moving "…"`, cancellable, then `api.moveFolder(id, parentId)`, then `reloadTree` and an expand hint on the destination parent.

Downloads is not a drop target. Its row has no `data-folder-id`. Leave it that way.

### Drag source and drop targets

- Source: pointer down on a folder row, except the twist button. A 5px threshold (`DRAG_THRESHOLD_PX`) separates a click (browse) from a drag. The library root and Downloads cannot be dragged.
- While dragging, the source row gets `.dragging` (opacity 0.45) and the sidebar gets `.folder-dragging` (`user-select: none` in `src/styles/layout.css`).
- Targets: any `[data-folder-id]`, including `root`. The row under the pointer is highlighted only when `isFolderUnderAncestor` says the drop is legal.
- Refused in the UI before any command: drop on itself, or drop on its own descendant. The backend repeats that check by walking `parent_id`.
- Same parent is not refused in the UI. The backend returns immediately (`Ok(false)`) without touching disk. See gaps.

### Disk and catalog

`move_folder` (`src-tauri/src/commands/library.rs`) takes a folder id and a parent id. It does not take a path from the webview. `AppDb::move_folder_with` then:

1. No-ops when `parent_id` is already the parent.
2. Errors with `Cannot move a folder into itself or its subfolder.` when the target is the folder or a descendant.
3. Builds the destination under the library root: the parent folder's `relpath`, or the root itself. `unique_dir_name` (`src-tauri/src/names.rs`) picks `Name` or `Name (2)` when that directory already exists. It does not overwrite and it does not ask.
4. `relocate::move_tree` (`src-tauri/src/relocate.rs`) tries `fs::rename` of the whole directory. On `ErrorKind::CrossesDevices` or Windows raw errors 17 and 18, it copies the tree (`WalkDir`, `follow_links: false`) and only then deletes the source. Cancel during the copy deletes the partial destination and leaves the source.
5. After the disk move succeeds, `rewrite_moved_tree` updates the catalog in one SQLite transaction: the moved folder's `parent_id`, `name`, and `relpath`, every descendant folder's `relpath`, and every file whose `stored_relpath` is that folder or starts with `old_rel/`. File `folder_id` values stay put because the folder ids did not change. Prefix match is `old_rel/` so `Source` does not rewrite `Source2`.
6. If the transaction fails, a rename is renamed back and a copy's destination is deleted. `relocate_folder_moves_disk_and_undoes_a_catalog_conflict` covers a unique-`relpath` failure.
7. If the copy succeeded and the catalog commit succeeded, the source tree is removed. If that delete fails, the error says the folder was copied and the original could not be removed. The catalog then points at the new place and the old directory is still on disk. There is no second automatic rollback.

Root folders are `parent_id` null. Dropping one onto another top-level folder, or dropping a nested folder onto the library root, is the same command with `parent_id: null`.

### What a move does not touch

| Data | Why it stays |
|---|---|
| Thumbnails | `thumb_path` is `data_dir/thumbs/{sha256}.png`, not a path beside the model |
| Hashes | `files.sha256` is not rewritten |
| Tags | `file_tags` is keyed by file id |
| Creators, notes, names | Those columns are not in the path update |
| FTS | `files_fts` stores `sort_name`, `original_name`, `creator`, `notes`, `tags_text`. The `files_au` trigger fires only for those columns, so a `stored_relpath` update does not rebuild the index |
| Folder history | History stores browse ids (`src/lib/folderHistory.ts`). The id still exists, so Back and Forward stay valid |
| Breadcrumb | `folderCrumbs` walks `parentId` after `reloadTree`, so the crumb follows the folder |
| Open folder | `onMoveFolder` does not change `browse`. The grid stays on that folder id and `refreshLists` reloads it |
| Expanded rows | Expansion is a set of `folder:{id}` keys, so it survives the reparent. The expand hint opens the destination parent |
| Rescan | Not required after a successful rewrite. The catalog paths already match the new disk paths |

A locked file fails the directory rename with the OS error (access denied or sharing violation). The copy fallback runs only for a cross-device error, so a lock does not turn into a half-copied tree. The catalog is unchanged because the rewrite runs after `move_tree` returns success.

Long paths use ordinary `std::fs` joins, the same as other library disk work. A path Windows rejects fails the rename, and the catalog is left as it was. This follow-up does not add a `\\?\` prefix layer.

## Gaps worth a follow-up

Do these in one small PR. Do not retarget the move, add undo, or add a collision dialog.

1. **Same parent is a no-op in the UI.** `isInvalidFolderDrop` should also reject a target whose id is already `folders.find(id).parentId` (and `root` when `parentId` is null). The row is not highlighted and pointer-up does not call `move_folder`. Today a drop on the current parent still calls the command, and a slow no-op can toast `Moved "…"`.
2. **Stay inside the library root.** Before `move_tree`, canonicalize the source directory and the destination parent the way `rename_library_file` does (`contained` path, no empty / `.` / `..` segment, canonical parent starts with the canonical library root). Refuse the move when that check fails, before any rename. Ids from the webview are already the only input; this closes a catalog `relpath` that points outside the root.
3. **Auto-scroll the folder list.** While a folder drag is active, if the pointer sits within 24px of the top or bottom of `.sidebar-scroll`, scroll that element. File marquee already does this inside the grid (`FileGrid.tsx`); keep the constants local to `Sidebar` rather than sharing marquee geometry. Auto-expand on hover stays the existing 500ms effect.
4. **Tests for those three.** Rust: a `relpath` of `../outside` (or a destination parent outside the root) returns an error and leaves both directories in place. Vitest: a pointer drag onto another folder calls `onMoveFolder` with that parent; a drag onto a descendant, onto itself, or onto the current parent does not. jsdom has no real layout, so stub `elementFromPoint` and assert the callback, and assert the scroll offset changes when the stubbed pointer is on the edge.

Collision handling stays `unique_dir_name`. Folder rename already does this (`rename_folder_with_picks_a_unique_name_on_collision`). A confirm dialog would block a gesture that file moves do not block, and refusing the drop would strand the user. The tree shows `Name (2)` after reload. The toast can keep the original name.

## Tests already in the tree

- `move_folder_updates_disk_and_paths` — nested folder and file paths, and a move into itself or a descendant is an error.
- `move_folder_copy_fallback_then_cancel_keeps_source` — forced copy, cancel removes the destination, a finished copy deletes the source and rewrites paths.
- `rewrite_moved_tree_rewrites_nested_catalog_paths` — descendants move, a folder outside the prefix does not, `folder_id` is unchanged.
- `relocate_folder_moves_disk_and_undoes_a_catalog_conflict` — a catalog unique failure puts the directory back.
- `unique_dir_name_numbers_collisions`, `same_volume_rename_moves_the_directory`, `copy_cancel_removes_the_partial_destination`, `crosses_devices_matches_exdev_and_the_windows_codes`.
- `isFolderUnderAncestor` and the `.folder-row.drop` render test. No test yet drives the folder pointer gesture.

## Suggested PRs

1. **This PR.** The plan file only.
2. **One follow-up, only for the gaps.** Same-parent no-op, canonical path check, sidebar auto-scroll, the tests above, and `npm run version:bump` to 26.11.0. No new command and no change to the rewrite transaction.

## Risks

- A successful cross-volume copy whose source delete then fails leaves two trees on disk and a catalog that points at the new one. Recovery is a manual delete or a rescan, which can see both. The follow-up does not change that order.
- Copy walks with `follow_links: false` and only copies files and directories. A symlink inside the tree is kept by a same-volume rename and skipped by the copy fallback.
- Depth-first copy of a huge folder holds the disk lock until it finishes. Cancel already stops the copy and deletes the partial destination. Rename of a same-volume folder is one OS call and is not cancellable mid-rename.
- `elementFromPoint` during a drag hits whatever is on top. A context menu or dialog left open can swallow the drop. The gesture already clears its own drag state on pointer up.

## Success criteria for the follow-up

- Dropping a folder on another folder or the library root moves the directory and the catalog rows for that folder, its descendants, and their files, and the breadcrumb shows the new parent.
- Dropping a folder on itself, a descendant, or its current parent does not call `move_folder` and does not toast success.
- A same-name folder at the target remains, and the moved folder appears as `Name (2)`.
- A path that canonicalizes outside the library root is refused with both directories unchanged.
- Holding the pointer at the top or bottom edge of the folder list scrolls it, and hovering a collapsed folder for 500ms expands it.

## Open questions

None. Same-parent handling, collision renaming, no undo, and tree-only drop targets are decisions, not leftovers.
