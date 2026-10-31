# Multiple windows and instances

Planning only. No application code in this change.

**Problem.** Nothing stops Jason from starting 3D File Library two or three times. Every copy is its own process, and all of them open the same `library.db`, `settings.json` and `thumbs` folder. WAL mode and a 5 second busy timeout keep short writes from colliding, but several things are not safe, or only look fine:

| Symptom | Cause in the code |
|---|---|
| A window shows old data after another window imports, moves, renames or deletes | Each webview caches its own folder tree and file list. The only cross-window signal is `hash-pass-complete`, and it is emitted per process. |
| "database is locked" during a rescan, big import, hash pass or restore | A job can hold the write lock longer than the 5 second timeout while another process writes. |
| Pane widths, pinned state, theme or Downloads folder from one window overwrite another's | `settings::save` writes the whole `settings.json`; the file is only read at startup. |
| "Undo last import" only knows its own deletes | `last_recycle_paths` and `last_recycle_roots` live in `AppState`, in memory, per process. |
| An older build breaks after a newer build migrates the database | `migrate` runs at startup in every process. |
| The installer or updater cannot replace the exe | Other copies still hold it open. |
| Two heavy jobs run at once | `disk_running` and the cancel flags are per process, so nothing stops a rescan in one copy and a restore in another. |

## Decision

**One process, many windows.** Add Tauri's single-instance plugin so a second launch hands off to the running process, and add a "New window" command that opens another webview in that same process. All windows then share one `AppState`, one database connection, one job lock, and one in-memory undo list. Several processes sharing one SQLite file would need file locks, change polling and settings merging; one process avoids all of that.

Assumptions:

- Windows x64 only. No macOS or Linux behavior is promised.
- A "window" is a full library window with its own browse location, selection and search. Library root, tags, creators, settings and the library contents are shared.
- Launching the exe again, or double-clicking it again, opens a new window instead of a new process. The first launch's `main` window is not special once others exist.
- No cross-machine sync. The database stays local.

Not in scope: per-window library roots, per-window themes, tabs, syncing two different computers, or letting two processes run on purpose.

## What changes, in the order to do it

### 1. One process: single instance

- Add `tauri-plugin-single-instance` (Tauri 2). In its callback, create a new window (step 2) and focus it. Pass nothing from the second launch's arguments for now.
- Capabilities: the plugin needs no webview permission.
- The existing `main` window label stays the label of the first window.

### 2. New window command

- Rust command `open_new_window` (also invoked by the single-instance callback). It builds a `WebviewWindowBuilder` with a unique label `win-<n>`, the same URL, title, size and `dragDropEnabled(true)` as `tauri.conf.json`, and offsets the position a little so it is not hidden behind the first window.
- File menu: **New window**, `Ctrl+N`, in `src/components/MenuBar.tsx`.
- Capabilities: `src-tauri/capabilities/default.json` has `"windows": ["main"]`. Change it to `["main", "win-*"]` so new windows get the same permissions. Keep `core:window:default` and add only the window-create permission the builder needs.
- Closing: closing any window closes only that window. The app exits when the last window closes. The updater's restart closes all windows through the process restart.

### 3. Shared state stays correct

State that must stay shared (already in `AppState` and works as is): `db`, `thumbs`, `import_cancel`, `disk_cancel`, `disk_running`, the undo lists, the hash pass.

State that must be per window, in the frontend only: browse location, selection, search text and scope, sort, scroll position, open dialogs, the import summary. These already live in React state, so a new webview starts with defaults. Nothing to move into Rust.

Settings stay global. Today's rule, last save wins, is acceptable inside one process because each save writes the whole current value of that field. Confirm that each setter (`set_pane_widths`, `set_inspector_pinned`, and so on) reads the current `Settings` from the database mutex and changes only its own field, so two windows saving different fields do not clobber each other.

### 4. Tell every window when the library changes

Add one event, `library-changed`, emitted with `app.emit` (which reaches every window) after any command that changes rows or folders: import, move, rename, delete, recycle, tag and creator edits, remove missing, rescan, restore, and clear cache. The payload is small: `{ kind: "files" | "folders" | "tags" | "settings" | "all", sourceWindow: string }`.

- The sender includes its window label. The window that caused the change ignores its own event because it already refreshed.
- Other windows refetch only what `kind` says: the folder tree, the current file list, tag and creator lists, or settings. Debounce bursts (an import of 500 files emits one event at the end, not 500).
- Reuse the existing `hash-pass-complete` listener in `src/hooks/useSessionEffects.ts` as the pattern. The frontend keeps one listener per window and removes it on unmount.
- A window whose current folder was deleted or renamed elsewhere falls back to its parent, or the library root, and shows a short notice.
- `settings` events refresh pane widths, pinned state, theme and the Downloads folder in the other windows, so the last change shows up everywhere.

### 5. One heavy job at a time, visible in every window

`disk_running` already prevents two disk jobs inside a process. Today a second window would just see an error string. Change that to:

- A job that cannot start because another is running returns a clear message ("A rescan is already running in another window").
- `disk-progress` and the import progress events already go to all windows through `app.emit`. Every window shows the same busy banner and a Cancel button that calls `cancel_disk_op` or `cancel_import`. Cancel works from any window because the flags are global.
- Dialogs that start a job are disabled in every window while it runs, including backup restore and library root move.

### 6. Undo is global

`recycle_last_import` already uses the shared undo lists. Because windows now share them, say so in the UI: the menu entry names what it will undo ("Undo import of 12 files"). No change to the data structure.

### 7. Migrations and updates

- Only one process opens the database now, so a second build cannot migrate underneath the first. The single-instance handoff takes care of the common case.
- Edge case: a new version installed while the old one still runs. The installer will replace the exe only after the old process exits. The app already offers "restart to update" through `process:allow-restart`, which ends the process and every window with it. No extra work beyond a manual test.
- If a second process somehow starts (single instance disabled by an error or a crash), it opens the database in normal mode as today. No new code path for it.

### 8. Edge cases to handle

- First window closed while others stay open: nothing special, since the process owns the state, not the window.
- Drag-and-drop out of the app (`drag_session.rs`, `drag_win.rs`): confirm drag state is keyed by window label or is a single global that only one drag at a time can use. Two simultaneous drags are impossible with one mouse, so a global is fine if it clears on drop.
- Thumbnail rendering: the offscreen renderer (`next_thumbnail`, `save_rendered_thumb`, `release_rendering_thumb`) must hand each thumbnail job to one window only. The existing "rendering" claim in the database already does that; add a test with two claimers.
- Window position memory is not persisted. Each new window opens at default size, offset from the active one.
- Closing the last window while a job runs exits the app and cancels the job, as today. Asking the user to cancel or keep running in the background is out of scope.

## Tests

Unit tests (Vitest) for every new or changed frontend piece, Rust tests for every new command.

| Piece | Test |
|---|---|
| `open_new_window` | Label generation is unique and increments. Config values match `tauri.conf.json`. |
| Capabilities | A test (or script in `npm test`) fails if `default.json` does not cover `win-*`. |
| `library-changed` emit | Each mutating command emits once with the right `kind`. A bulk import emits one event. |
| Refresh listener | A window ignores events whose `sourceWindow` is itself. It refetches only the listed kind. Bursts are debounced to one refresh. |
| Deleted or renamed current folder | The window falls back to the parent or root and shows a notice. |
| Settings setters | Two setters in a row keep both changes (no whole-file overwrite from stale data). |
| Job lock | A second start returns the "already running" message and does not block. Cancel from another window stops the job. |
| Thumbnail claim | Two claimers never get the same thumbnail. |
| Graph coverage | Run `.cursor/skills/graph-coverage` on the new code and fill the unit-test gaps it finds. |

Manual checks on Windows, PowerShell, `npm run tauri dev`:

1. Press `Ctrl+N` twice. Three windows open, offset from each other.
2. Launch the built exe again. A new window opens in the same process (Task Manager shows one `3D File Library` process tree, not two).
3. Import files in window A. Windows B and C update their folder tree and file list without a manual refresh.
4. Delete a folder in A while B is inside it. B moves to the parent and shows a notice.
5. Start a rescan in A. B and C show the busy banner, and starting another job there says one is already running. Cancel from B stops it.
6. Change pane widths in A and the Downloads folder in B. Both changes appear in all windows and survive a restart.
7. Close the first window. The others keep working. Close the last one and the process exits.
8. Run the updater or installer with three windows open. The restart closes them all and the new version opens one window.

## Build order

One PR, in four commits so each can be reviewed alone:

1. Single-instance plugin, `open_new_window`, File menu item, capabilities, window-close behavior.
2. `library-changed` event and the frontend refresh listener, with the folder-deleted fallback.
3. Job lock messages, the shared busy banner, and the undo wording.
4. Settings setter audit and tests, thumbnail claim test, graph-coverage run.

Version bump to the next number with the repo's version script, kept in sync across `package.json`, `tauri.conf.json` and `Cargo.toml`. Code written by the current Composer model, then reviewed by a higher model, then `/review-bugbot` if the agent has it.

## Risks

- A window that never receives an event (listener missing after hot reload) stays stale. A manual Refresh in the View menu is the fallback.
- Event storms from a rescan could flood windows. Debounce on the receiving side and emit once per command on the sending side.
- Tauri's single-instance plugin is a Windows named mutex. If a crash leaves a hung process, the next launch opens a window in a dead process and nothing appears. The fallback is Task Manager. Test a forced kill before release.
- The assumption that every setter changes one field must be checked in the code, not assumed.

## Open questions

None that block the plan. If Jason wants windows to remember their size and position between launches, that is a small follow-up and is left out here.
