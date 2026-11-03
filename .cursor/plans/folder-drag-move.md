Status: implemented in PR (folder drag-move implementation)

# Drag a folder from the center grid

Planning only. No application code in this change.

**Problem.** File tiles in the center grid drag onto a folder. Folder tiles and rows in that same grid do not drag anywhere. Jason's correction: the left tree is not the gap. The tree already starts a folder drag and calls `move_folder`.

**Do not rebuild the move.** `move_folder` in `src-tauri/src/commands/library.rs`, `AppDb::move_folder_with` in `src-tauri/src/db/folders.rs`, and `relocate::move_tree` in `src-tauri/src/relocate.rs` already move the directory and rewrite descendant folder and file paths. The new work is a drag source on the grid folder items, plus the drop rules that source must share with the tree.

## Assumptions

- One folder per drag from the grid. See the multi-select decision below.
- A drop means "make this the new parent", the same meaning as a drop on the tree. It does not reorder siblings.
- Folder ids stay stable. Descendant folders and files keep their ids. The command updates `parent_id`, the folder name when a collision renames it, `folders.relpath`, and `files.stored_relpath`.
- No undo. File moves have none, and a folder tree can be large.
- Windows x64. Same-volume moves rename. A cross-device error uses the existing copy-then-delete path.
- This document does not bump the version. The implementation PR in November 2026 runs `npm run version:bump`, which turns 26.10.38 into **26.11.0**.

## Why the grid folder does not drag

`useFileDrag` (`src/hooks/useFileDrag.ts`) starts only when the press target matches `[data-file-id]`:

```ts
const tile = (event.target as HTMLElement).closest("[data-file-id]");
if (!tile || event.button !== 0) return;
```

That hook is the app's `onPointerDown` (`src/App.tsx`). It then either moves those catalog ids with `api.moveFiles` or, once the pointer leaves the window, starts a native drag-out through `prepare_drag_paths` and `@crabnebula/tauri-plugin-drag` (`src-tauri/src/drag_out.rs`). `nativeDragDecision` in `src/lib/dragOut.ts` arms that native drag only after slop and an outside-window pointer, or when the browser fires `dragstart` on a file tile.

Grid folders never enter that hook:

| View | Component | Marker | Drag |
|---|---|---|---|
| Tiles | `FileGrid` folder `<button class="tile folder-tile">` | `data-folder-id` only | `draggable={false}` and `onDragStart` prevented |
| List | `ListRow` with `isFolder` | `data-folder-id` only | same |
| Details | `DetailsFolderRow` | `data-folder-id` only | same |

There is no `onPointerDown` on those three. `selected` is a list of file ids, and folder rows are rendered with `selected={false}`. `fileIdAt` skips `kind: "folder"`, so marquee selection never includes them. Double-click calls `onOpenFolder`. Right-click opens the folder menu, whose Rename is a prompt (`openRenameFolderPrompt`), not an in-place editor.

`draggable={false}` is why a native HTML drag also does nothing. That is intentional for files too: the real drag is the pointer gesture, and HTML drag of a thumbnail is cancelled by `suppressHtmlDrag`.

The left tree is a separate gesture (`Sidebar` `onFolderRowPointerDown`). It does not apply to grid rows. Downloads and a filtered library show no folder tiles (`centerSubfolders` returns `[]`), so this gesture only exists on an unfiltered library folder or the library root.

## What to reuse

- **Move command.** `api.moveFolder(id, parentId)` and the existing `runDiskOp` call in `App.tsx` (`Moving "…"`, cancellable, then `reloadTree` and an expand hint on the new parent).
- **Legal-drop check.** `isFolderUnderAncestor` in `src/components/Sidebar.tsx` already rejects a drop on the folder itself or a descendant. Move that function to `src/lib/folderMove.ts` and use it from both the tree and the grid. Add the same-parent check there so both gestures share it.
- **Drop highlight and auto-expand.** File drags set `dropTarget` to the `[data-folder-id]` under the cursor. The tree paints `.folder-row.drop` and expands a closed row after 500ms. A grid folder drag should set that same `dropTarget` only when the drop is legal, so the tree highlight and the 500ms expand work without a second mechanism.
- **Slop.** Use `DRAG_OUT_SLOP_PX` (8) from `src/lib/dragOut.ts` before a press becomes a drag, so a click or double-click does not move the folder.
- **Backend behavior already tested.** Nested path rewrite, refusal to move into itself or a descendant, `Name (2)` on a name collision (`unique_dir_name`), same-volume rename, cross-device copy, cancel deleting a partial copy, and rolling the directory back when the catalog transaction fails. Thumbnails stay `data_dir/thumbs/{sha256}.png`. Hashes, tags, creators, and notes stay on the file id. `files_fts` does not index `stored_relpath`, and the FTS trigger does not fire for that column. History and the breadcrumb use folder ids, so they follow the folder after `reloadTree`. Rescan is not required after a successful rewrite.

## Gesture

Start it from the grid only. A new attribute `data-grid-folder={id}` on the tile, list row, and details row marks the source. Pointer down elsewhere, including the sidebar and the folder picker (both already use `data-folder-id`), keeps today's behavior.

1. Primary button on `[data-grid-folder]`. Do not set the file `dragRef`. Do not call `prepareDragPaths`.
2. Move past 8px: the source row gets `.dragging`. Resolve the element under the pointer.
3. A legal `[data-folder-id]` becomes `dropTarget`. An illegal target, a file tile, or empty grid space clears it.
4. Pointer up on a legal target calls `moveFolder(draggedId, parentId)` through the existing disk operation. Anything else is a no-op and does not toast success.

`data-folder-id` stays on the grid folder so it remains a drop target for file drags and for this drag.

### Drop targets

| Target | Result |
|---|---|
| Another folder in the left tree | Parent becomes that folder. The tree row highlights and can auto-expand. |
| Another folder tile or row in the grid | Same parent change. The tile or row gets `.drop` when `dropTarget` matches its id. File drags already resolve these nodes; they should use the same class so a file drop on a grid folder is visible too. |
| Library root row | `parentId` null. |
| Breadcrumb segment for the root or a real folder | Add `data-folder-id` on those buttons (`root` or the folder id) and the same `.drop` class. Ellipsis and the Downloads crumb get no id. Dropping on a crumb is the same as dropping on that folder in the tree. File drags then land there too, which matches a drop on the tree row. |
| The folder being dragged, one of its descendants, or its current parent | No highlight, no command. |
| A file tile, empty grid, Downloads row, or a point outside the window | No command. |

Same-parent includes the breadcrumb crumb for the folder that already contains the dragged folder, and the library root when the dragged folder is already a root child.

### Native drag-out

Do not call `startDrag` for a folder. `drag_out.rs` prepares catalog files (extension staging, hard links, `CF_HDROP` of file paths). A directory is not one of those ids. Dragging a folder out to Explorer is a different feature and is not part of this change.

If the pointer leaves the window during a folder gesture, clear the highlight and ignore pointer-up. Keep `draggable={false}` and the `dragstart` preventDefault on the folder controls. The app-level `dragstart` handler in `useFileDrag` must see a null file `dragRef` and must not call `tryStartRef`, or a folder tile (class `tile`, which `shouldBlockHtmlDrag` matches) could arm a native file drag with no paths.

### Click, marquee, rename

- Under 8px, pointer-up does not move. The folder button keeps `onDoubleClick` → `onOpenFolder`. Do not `preventDefault` on pointer-down, so the double-click still reaches the button.
- Marquee already ignores pointer-down on `[data-folder-id]` (`FileGrid` returns before the band starts). Empty-space marquee and file selection stay as they are.
- Rename stays the context-menu prompt. The drag starts only on button 0, so right-click still opens the menu.

### Multi-select

**One folder, no mixed payload.** Grid selection is file ids, and a folder id can equal a file id, so folders cannot be stored in `selected`. Marquee skips folder indexes. `move_folder` takes one id. Moving several folders in one drop, or a mix of files and folders, needs a new selection model and a defined order when one selected folder contains another.

Pointer-down on a folder moves that folder only, even if files are selected. Pointer-down on a file keeps today's file drag and does not attach folders to it. A later multi-folder selection can call `moveFolder` once per id only after ids can no longer collide.

### Auto-scroll

While the folder gesture is past the slop, scroll the pane under the pointer when it sits within 28px of that pane's top or bottom, using the same step idea as the grid marquee (`SCROLL_EDGE` / `SCROLL_MAX` in `FileGrid.tsx`). That covers `.sidebar-scroll` and the grid scroll root. The tree's 500ms auto-expand stays driven by `dropTarget`.

### Hardening that still applies

These stay in the same implementation PR because the grid calls the same command.

- **Stay inside the library root.** Before `move_tree`, canonicalize the source directory and the destination parent, the way `rename_library_file` does. Reject an empty, `.`, or `..` segment, and reject a canonical path that does not start with the canonical library root. Do this before any rename. The webview still sends ids only.
- **Name collision.** Keep `unique_dir_name`. A folder named `Toys` dropped where `Toys` exists becomes `Toys (2)`. Folder rename already does this. No confirm dialog.
- **Same-parent no-op on the tree too.** The tree currently highlights the current parent and calls `move_folder`, which returns without touching disk and can still toast `Moved`. The shared legal-drop helper should make that a quiet no-op.

Locked files fail the directory rename with the OS error, and the catalog is unchanged because the rewrite runs only after `move_tree` succeeds. Long paths use the same `std::fs` joins as the rest of the library. This change does not add a `\\?\` prefix.

## Tests

- `legalFolderDrop` (the shared helper): another folder and the root are accepted; self, a descendant, and the current parent return no target.
- Grid gesture: pointer-down on `data-grid-folder`, move onto a sidebar or grid `data-folder-id`, pointer-up calls `moveFolder` with that parent and does not call `prepareDragPaths`, `moveFiles`, or `startDrag`.
- The same gesture released over a descendant, the source tile, the current parent, or outside the window calls none of those.
- A file tile drag still calls `moveFiles` and can still start native drag-out. A folder gesture that leaves the window does not.
- A double-click on a folder tile still calls `onOpenFolder`. A pointer-down on a folder tile does not start the marquee.
- The grid folder and a breadcrumb segment pick up `.drop` when `dropTarget` matches.
- Rust: a `relpath` that canonicalizes outside the library root returns an error and leaves both directories in place. Existing move, collision, copy-cancel, and catalog-rollback tests stay as they are.

## Suggested PRs

1. **This PR.** Plan only.
2. **One implementation PR.** `data-grid-folder` on the three grid folder views, the shared legal-drop helper, tree and grid and breadcrumb highlights, same-parent no-op, no native drag-out, auto-scroll of the tree and the grid, the canonicalize check in `move_folder`, the tests above, and version **26.11.0**.

## Risks

- Two listeners both see `pointermove`. The folder gesture must not write the file `dragRef`, or leaving the window will drag files out.
- `elementFromPoint` hits the topmost node. An open menu can hide the row under the cursor; pointer-up then no-ops.
- A cross-volume copy whose source delete fails leaves two trees and a catalog that points at the new one. Unchanged from today's `move_folder`.
- The copy walk skips symlinks (`follow_links: false`, files and directories only). A same-volume rename keeps them.
- Giving breadcrumb buttons `data-folder-id` also makes them file-drop targets. That is the same move files already do onto the matching tree row.

## Success criteria

- Dragging a folder tile, list row, or details row onto another folder in the tree or the grid, or onto the library root or a breadcrumb folder, moves it on disk and in the catalog. The breadcrumb shows the new parent.
- Double-click still opens the folder. Marquee, file drag, and file drag-out still work. A folder drag that leaves the window does not start a native drag.
- A drop on itself, a descendant, or its current parent does nothing and does not toast success.
- A same-name folder at the destination remains, and the moved folder appears as `Name (2)`.
- A path outside the library root is refused with both directories unchanged.
- The tree or the grid scrolls when the pointer sits on that pane's edge, and a hovered collapsed tree row expands after 500ms.

## Open questions

None. One folder per drag, no mixed file-and-folder payload, no Explorer drag-out, and breadcrumb crumbs as normal parent targets are the decisions above.
