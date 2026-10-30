# Downloads folder

Planning only. No application code in this change.

**Assumptions.** One saved directory. The view lists compatible files in that folder and in its subfolders, as a flat Details list with a path column. Import uses the existing `import_paths` pipeline: every selected file lands in the one chosen library folder, and each archive still creates its own folder named after the archive. Creator and tags are chosen with the destination, then shown again pre-filled on the import summary, which is where they are saved. Version stays 26.10.35 until this is implemented; the next October bump is 26.10.36.

## What to reuse

| Piece | Where | How Downloads uses it |
|---|---|---|
| Settings load/save | `src-tauri/src/settings.rs`, `src-tauri/src/commands/settings.rs` | New `downloadsFolder: string \| null`, `#[serde(default)]`, command `set_downloads_folder` |
| Directory picker | File menu in `src/components/MenuBar.tsx`, `open({ directory: true })` in `src/hooks/useSessionEffects.ts` | “Set Downloads folder…” |
| Supported types | `src/supportedTypes.json`, `is_supported_file` and `is_archive` in `src-tauri/src/names.rs` | A file is listed when it is a supported type or zip/7z/rar. `is_supported_file("zip")` is false, so archives stay a separate check |
| Directory walk | `walkdir` already used by `src-tauri/src/import/plan.rs` | `list_downloads` walks with `follow_links: false` |
| Import | `import_paths` in `src-tauri/src/commands/import_cmd.rs` and `src-tauri/src/import/plan.rs`; archives in `src-tauri/src/import/archive.rs` | One call: `api.importPaths(selectedPaths, folderId)` |
| Creator and tags | `src/components/dialogs/ImportSummaryDialog.tsx`, `src/lib/commaTags.ts`, `src/lib/importMeta.ts`, `TagChip`, `displayTagColor` | Shared fields in the Add to library dialog and the summary |
| Meta write | `api.applyBulkMeta` → `apply_import_meta` | On the summary buttons, using the pre-filled values |
| Selection gestures | `src/components/FileGrid.tsx` (`replace` / `toggle` / `range`) | Same gestures, keyed by path |
| History | `src/lib/folderHistory.ts`, `src/lib/breadcrumb.ts`, `Browse` in `src/types.ts` | `{ type: "downloads" }`, then `pushFolder` to the destination after a successful add |
| Containment | `path_within` in `import/plan.rs` | Same idea for the saved folder and for every listed file |

`runImport` in `src/hooks/useLibrary.ts` imports into `targetFolderId`, which is null unless `browse.type === "folder"`. On Downloads that would land files in the library root. The Add to library confirm path calls `importPaths` with the folder id from the dialog.

It also clears creator and tags before opening the summary:

```ts
const result = await api.importPaths(paths, targetFolderId);
setImportCreator("");
setImportTags([]);
setImportTagText("");
setSummary(result);
```

The Downloads path keeps those three values so the summary opens pre-filled.

## Setting

Persist `downloads_folder: Option<String>` in `settings.json`, camelCase `downloadsFolder` on the frontend `Settings` type. A missing field loads as null.

`set_downloads_folder` accepts a path or null. A path must exist, be a directory, and canonicalize. Reject it when it sits inside the library root. Store the canonical path. Null clears it. A folder that later disappears stays in settings; the empty view says it is missing and offers “Set Downloads folder…” again.

File menu item “Set Downloads folder…”. Clear lives on the empty Downloads view. Do not guess the OS Downloads folder.

## Sidebar and view

In `src/components/Sidebar.tsx`, the Downloads row sits directly above the library root. No Places label. Label “Downloads”. Green down-arrow as an inline SVG. No twisty, no drop target, no folder context menu. Active when `browse.type === "downloads"`.

Extend `Browse` with `{ type: "downloads" }` so Back returns to the previous library folder. Breadcrumb is one crumb, “Downloads”. History is in memory; do not persist Downloads as the folder restored on launch.

While Downloads is selected, pass `view="details"` locally. `App.tsx` currently passes `view={settings.gridSize}`. Leaving Downloads restores that saved view. Do not write `gridSize`.

## Listing

New command `list_downloads` in `src-tauri/src/commands/downloads.rs`. It reads the saved setting and takes no directory argument.

Results:

- **unset** — no path saved
- **missing** — saved path does not exist or is not a directory
- **ok** — rows plus `truncated`

Each row is `{ name, relativeDir, ext, sizeBytes, mtime, absolutePath }`. `relativeDir` is empty for a file in the Downloads root and `prints/boats` for a file nested there. No catalog id.

**Recursive, with caps.** Walk with the existing `walkdir` crate, `follow_links: false`.

- Depth: `max_depth` 8. In walkdir that is the root plus seven levels of subfolders.
- Files returned: 5000 compatible files, then stop. Set `truncated`.
- Directories entered: 2000, then stop and set `truncated`, so a huge tree of empty folders cannot run away.
- Skip `.crdownload`, `.part`, and `.tmp`. Skip directories as rows. Skip files that cannot be read.

The walk is depth-first, so a very large first subfolder can fill the 5000 cap before later siblings are seen. The banner says the list is truncated. A breadth-first walk would prefer shallower files and is a later change if that bias shows up in practice.

**Flat list, path column.** A second folder tree would need expand state and a meaning for “add this folder”. The view is a file list: Name, Path (`relativeDir`), Size, Modified, and blank Date added and Creator. Default sort is path, then name, so a subfolder’s files sit together. Sort is in memory. The Path column is local to this view and is not stored in `detailsColumns`.

**Symlinks and containment.** Directory symlinks and junctions are not followed, which avoids cycles and leaves the tree. A file symlink is included only when its canonical path is still inside the canonical downloads root; a target outside that root is omitted. Dedupe by canonical path so a symlink and its target are one row. Every emitted path is checked again after canonicalize.

**Performance.** The command reads directory entries and file metadata only. It does not hash, thumbnail, or open archives. Run it on a blocking thread, same as other disk commands, with the existing busy state. Refresh when the user selects Downloads and from a Refresh button. A recursive watcher is a worse fit once subfolders are included: it watches a whole tree, races the caps, and needs a new dependency. Refresh stays manual.

## How this view differs from the library

These rows are not catalog files and must not be `FileRow`s.

- Search, tag filter, type filter, creator filter, and search scope stay disabled. `libraryListScope` gets a Downloads arm that does not query the catalog.
- Inspector is read-only: name, relative path, absolute path, size, modified.
- Drag-out stays off. `src-tauri/src/drag_out.rs` drags catalog ids.
- Marquee stays off. Selection is click, Ctrl/Cmd toggle, and Shift range, matching `FileGrid`.
- Context menu for this view only: “Add to library” and “Show in Explorer”. Catalog items (Rename, Set Creator, Add tags, Open in…) stay on the catalog menu.

**Selection.** Downloads selection is a set of absolute paths, separate from catalog ids. Entering Downloads clears catalog selection. Leaving clears the Downloads selection.

- Click replaces the selection with that row.
- Ctrl/Cmd click toggles the row.
- Shift click selects the range in the current sort.
- Right-click on a row that is already selected keeps the selection. Right-click on an unselected row replaces the selection with that row, then opens the menu.
- “Add to library” uses the whole selection. “Show in Explorer” uses the right-clicked path only.

## Add to library

One dialog, one confirm, for one file or many. It collects:

1. Destination library folder (library root or a `FolderRow`), defaulting to the library folder the user was browsing before Downloads.
2. Creator, same input and `creators` datalist as `ImportSummaryDialog`.
3. Tags, same chips and comma field.

**Same component, different moment.** Pull the creator input, `TagChip` list, and comma field out of `src/components/dialogs/ImportSummaryDialog.tsx` into a shared block, `ImportMetaFields`. Both dialogs pass `creators`, `tags`, `tagCounts`, and the existing `importCreator` / `importTags` / `importTagText` state. The block calls `commaTagOptions`, `tagFieldKey`, `appendCommaTags`, and `displayTagColor`.

- **Add to library** runs first. Source is the selected Downloads paths. Confirm is “Add to library”. It stores the creator and tags and starts the import. It does not call `applyBulkMeta`.
- **Import summary** runs after `importPaths` returns, with those fields still filled in, including text still sitting in the comma field. The user can edit them. “Keep originals” and “Move to Recycle Bin” keep today’s behavior: `importMetaPayload(summary.importedIds, creator, appendCommaTags(tags, pendingText))`, then `applyBulkMeta` when the payload is non-null. The summary still says “Applies to newly imported files only.”

On confirm:

1. `api.importPaths(paths, folderId)` with every selected absolute path and the dialog’s folder id. One batch, one destination, one creator, one tag set.
2. Leave `importCreator`, `importTags`, and `importTagText` as entered.
3. `setSummary(result)`.

Loose files are copied into the chosen folder. Their Downloads subfolder is not recreated. Each archive is handled by `import_archive`: extracted under the destination into a folder named after the archive stem, with the existing entry and size caps. A selection that mixes `.stl` files and a `.zip` is one `import_paths` call; the command already branches per path. Tags and creator apply to `summary.importedIds`. For an archive those ids are the extracted files. Duplicates are absent from that list. An empty creator and no tags skip `applyBulkMeta`.

**After a successful add, open the destination.** Successful means `importedCount > 0`, including a partial batch. `pushFolder` to that library folder so Back returns to Downloads, reload the tree, and `setSelected(result.importedIds)` when that list is non-empty. The summary opens on top of the destination. When `importedCount` is 0 (everything duplicate or failed), stay on Downloads and still open the summary, because the destination has nothing new to show.

The summary already reports the batch: imported count, duplicate count, left-in-place count, the first five failure strings, and pending hash count. Recycle still uses `last_recycle_paths` for the whole batch, so “Move to Recycle Bin” can remove every source the pipeline recorded, including archives and duplicates.

### SUMMARY_ID_CAP

`summary_for_api` in `src-tauri/src/import/mod.rs` clears `importedIds` when more than `SUMMARY_ID_CAP` (200) files were imported, while `importedCount` stays accurate. A large archive can therefore open a pre-filled summary whose Save buttons have no ids to tag. That is existing import behavior. This plan leaves the cap as it is.

## The downloaded original

The pipeline copies into the library (`src-tauri/src/import/store.rs`) and records sources for optional recycle. Default remains “Keep originals”. The summary asks about the Recycle Bin when `recycleCount > 0`.

## Security

- Canonicalize before save and before listing.
- Reject a downloads path inside the library root.
- Do not follow directory symlinks. Drop file symlinks whose canonical path is outside the downloads root.
- `import_paths` still refuses paths inside the library.
- `list_downloads` ignores any caller-supplied directory.
- Depth, directory, and file caps bound the walk.

## Tests

- Settings: round-trip; reject a missing path, a file, and a path inside the library; null clears.
- `list_downloads`: includes a top-level `.stl` and a `.zip` in a subfolder; omits `.exe`, `.crdownload`, and a file past depth 8; does not descend a directory symlink; omits a file symlink that points outside; dedupes a file symlink that points inside; sets `truncated` at 5000 files and at 2000 directories; unset and missing are typed results.
- Selection helper: replace, Ctrl toggle, Shift range; right-click inside the selection keeps it; right-click outside replaces it with that path.
- Add dialog: comma suggestions and a pending tag are the shared field behavior; confirm calls `importPaths` with every selected path (files and archives) and the chosen folder id, and does not clear creator or tag state.
- Summary: opens with that creator, chips, and pending text; Keep originals calls `applyBulkMeta` with `importedIds` and `appendCommaTags` of that pending text; blank creator and no tags do not call it.
- Navigation: `importedCount > 0` pushes the destination and selects the returned ids; `importedCount === 0` leaves history on Downloads.
- Sidebar: Downloads is the row before the library root.

## Suggested PRs

Both branch from latest `main`. Each bumps the version when it ships.

1. **Browse Downloads.** Setting, menu item, sidebar row directly above the library root, recursive `list_downloads`, flat Details list with the path column, path-keyed selection, Refresh, `{ type: "downloads" }` through history, breadcrumb, and scope, local Details override, empty and missing states. Catalog tools disabled on this view.
2. **Add to library.** Shared `ImportMetaFields` used by the summary and the new dialog. Destination, creator, and tags in one confirm. Multi-select, including archives, in one `importPaths` call. Keep the meta fields filled. Summary pre-filled. Jump to the destination and select the new ids when `importedCount > 0`.

No watcher in either PR.

## Risks

- Every `Browse` match (`libraryListScope`, breadcrumb, sidebar, `targetFolderId`) needs a Downloads arm.
- The Details override must not persist `gridSize`.
- Forgetting the dialog folder id imports into the library root.
- Depth-first truncation can hide files in later folders while an earlier folder fills the 5000 cap.
- A file symlink is listed only after canonicalize; a directory junction must be detected before follow, or the walk leaves the chosen folder.
- `importedIds` is empty above 200 new files (`SUMMARY_ID_CAP`), so pre-filled creator and tags on that summary do not save.
- “Move to Recycle Bin” still removes every recorded download in the batch, including originals that were duplicates.
- Jumping away on partial success hides the Downloads list while the summary is open; failures are on the summary, not beside the rows that failed.

## Open question

Imports of more than 200 new files return counts and an empty `importedIds`. Should a later change apply creator and tags from the full id list inside the import command, before that cap, or is the current summary limit acceptable for Downloads too?

## Decisions already made

1. Include subfolders in the first version, as a flat list with a path column, depth 8, 5000 files, 2000 directories. Refresh stays manual.
2. After a successful add (`importedCount > 0`), jump to the destination library folder.
3. Multi-select, including archives, goes to one destination with one creator and one tag set.
4. The Downloads row sits directly above the library root.
5. The import summary still shows creator and tags, pre-filled from the Add to library dialog.
