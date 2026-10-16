---
name: Multi-select creator and tags
overview: Right-click on one or more selected files to set the creator or add tags, reusing the folder Set Creator and Tag contents dialogs.
todos:
  - id: backend-add-tags
    content: Add AppDb::add_tags_to_files and the add_tags_to_files command, with add_tags_under_folder delegating to it
    status: pending
  - id: dialogs-file-targets
    content: Let CreatorDialog and FolderTagDialog act on an explicit list of file ids
    status: pending
  - id: file-menu-items
    content: Add Set Creator… and Add tags… to the file context menu, with Explorer-style right-click selection
    status: pending
isProject: false
---

# Multi-select creator and tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ctrl-click several files in the grid, right-click, and set the creator or add tags on all of them, in the same way that the folder context menu works.

**Architecture:** The existing folder dialogs (`CreatorDialog`, `FolderTagDialog`) get an optional `fileIds` on their target. When `fileIds` is present, the dialog acts on those files instead of a folder. The file context menu opens these dialogs with the current selection. Setting the creator reuses the existing `apply_bulk_meta` command. Adding tags needs a new `add_tags_to_files` command, because `apply_bulk_meta` replaces tags and the folder flow adds them.

**Tech Stack:** Tauri 2 (Rust, rusqlite), React + TypeScript, Vitest + @testing-library/react (no user-event; use `fireEvent`).

## Decisions (confirmed with Jason)

- If you right-click a file that is not in the selection, the selection changes to only that file, as in Windows Explorer. If you right-click a file that is already selected, the selection stays the same.
- Add tags keeps the tags the files already have, the same as the folder's "Tag contents…".
- "Set Creator…" and "Add tags…" appear for a selection of one file as well as for several files.

## Approaches considered

1. **Recommended: reuse the folder dialogs with an optional `fileIds` on the target.** This adds one optional field and no new dialog components. The copy and the folder-only "Include subfolders" checkbox switch on `fileIds`.
2. New `SelectionCreatorDialog` / `SelectionTagDialog` components. These would duplicate about 60 lines of dialog markup each for no behavior gain.
3. Reuse the import "Tag this import" card. That card replaces tags and combines creator and tags in one form, which does not match the folder behavior.

## Global Constraints

- Menu labels are `Set Creator…` and `Add tags…`. They use the Unicode ellipsis `…`, like the folder menu.
- Tags are added, never replaced. A blank creator is rejected (Apply stays disabled), the same as the folder dialog.
- Files marked missing (`missing = 1`) are skipped, the same as the folder commands.
- App commands do not need entries in `src-tauri/capabilities`. Only plugin commands do (see `scripts/check-capabilities.mjs`).
- Rust builds on this machine use the GNU toolchain with MinGW. Before running `cargo` directly in PowerShell, run:
  `$env:PATH = "$HOME\mingw\winlibs\mingw64\bin;$env:PATH"; $env:CC = "x86_64-w64-mingw32-gcc"`

## File map

| File | Change |
| --- | --- |
| `src-tauri/src/db/tags.rs` | Add `add_tags_to_files`. `add_tags_under_folder` delegates to it. |
| `src-tauri/src/db/tests_tags.rs` | Test for `add_tags_to_files`. |
| `src-tauri/src/commands/files.rs` | `add_tags_to_files` Tauri command. |
| `src-tauri/src/lib.rs` | Register the command. |
| `src/api.ts` | `api.addTagsToFiles`. |
| `src/hooks/useLibrary.ts` | `fileIds?: number[]` on `folderTagTarget` and `creatorTarget`. |
| `src/hooks/useSessionEffects.ts` | Matching types. File targets skip the folder count query. |
| `src/components/dialogs/CreatorDialog.tsx` | File-target copy and apply path. |
| `src/components/dialogs/FolderTagDialog.tsx` | File-target copy and apply path. |
| `src/components/dialogs/CreatorDialog.test.tsx` | New. |
| `src/components/dialogs/FolderTagDialog.test.tsx` | New. |
| `src/components/dialogs/FileContextMenu.tsx` | Two new menu items. |
| `src/components/dialogs/FileContextMenu.test.tsx` | New. |
| `src/App.tsx` | Explorer-style selection on right-click. |

---

### Task 1: Backend `add_tags_to_files`

**Files:**
- Modify: `src-tauri/src/db/tags.rs:33-66` (`add_tags_under_folder`)
- Modify: `src-tauri/src/commands/files.rs` (after `add_tags_under_folder`, around line 219)
- Modify: `src-tauri/src/lib.rs:83` (handler list)
- Modify: `src/api.ts:56-57`
- Test: `src-tauri/src/db/tests_tags.rs`

**Interfaces:**
- Produces: `AppDb::add_tags_to_files(&self, file_ids: &[i64], tags: &[String]) -> Result<i64, String>`. It returns the number of present, non-missing files that were updated. If no tag names are left after trimming, it returns `file_ids.len()` and writes nothing.
- Produces: Tauri command `add_tags_to_files(ids: Vec<i64>, tags: Vec<String>) -> Result<i64, String>`.
- Produces: `api.addTagsToFiles(ids: number[], tags: string[]): Promise<number>`.

- [ ] **Step 1: Write the failing test.** Append inside `src-tauri/src/db/tests_tags.rs` (the file is `include!`d into `mod tests` in `db/mod.rs`, so keep the 4-space indent):

```rust
    #[test]
    fn add_tags_to_files_keeps_existing_and_skips_unlisted() {
        let (dir, db) = scratch_db("tag-files");
        let first = db
            .insert_file("a.stl", "a.stl", "stl", 1, "sha-a", 1, None, None)
            .unwrap();
        let second = db
            .insert_file("b.stl", "b.stl", "stl", 1, "sha-b", 1, None, None)
            .unwrap();
        let unlisted = db
            .insert_file("c.stl", "c.stl", "stl", 1, "sha-c", 1, None, None)
            .unwrap();
        db.set_tags(first, &["existing".into()]).unwrap();

        let count = db
            .add_tags_to_files(&[first, second, 999_999], &["newtag".into(), "  ".into()])
            .unwrap();
        assert_eq!(count, 2);

        let rows = db.list_files(FolderFilter::All, "", "", "", "name").unwrap();
        let tags_of = |id: i64| rows.iter().find(|file| file.id == id).unwrap().tags.clone();
        assert_eq!(tags_of(first), vec!["existing", "newtag"]);
        assert_eq!(tags_of(second), vec!["newtag"]);
        assert_eq!(tags_of(unlisted), Vec::<String>::new());
        let _ = std::fs::remove_dir_all(&dir);
    }
```

- [ ] **Step 2: Run the test to verify it fails.**

Run (from `src-tauri`, after the MinGW PATH line): `cargo test add_tags_to_files`
Expected: compile error `no method named add_tags_to_files found for reference &AppDb`.

- [ ] **Step 3: Implement it.** In `src-tauri/src/db/tags.rs`, replace the whole `add_tags_under_folder` function (lines 33-66) with:

```rust
    pub fn add_tags_under_folder(&self, folder_id: Option<i64>, tags: &[String]) -> Result<i64, String> {
        let file_ids = self.file_ids_under_folder(folder_id)?;
        self.add_tags_to_files(&file_ids, tags)
    }

    pub fn add_tags_to_files(&self, file_ids: &[i64], tags: &[String]) -> Result<i64, String> {
        let names: Vec<String> = tags
            .iter()
            .map(|t| t.trim())
            .filter(|t| !t.is_empty())
            .map(|t| t.to_string())
            .collect();
        if names.is_empty() {
            return Ok(file_ids.len() as i64);
        }
        let tx = self.conn.unchecked_transaction().map_err(|e| e.to_string())?;
        let tag_ids: Vec<i64> = names
            .iter()
            .map(|name| self.ensure_tag_id(name))
            .collect::<Result<Vec<_>, _>>()?;
        let mut updated = 0;
        for file_id in file_ids {
            let present = tx
                .query_row(
                    "SELECT 1 FROM files WHERE id = ?1 AND missing = 0",
                    [file_id],
                    |_| Ok(true),
                )
                .optional()
                .map_err(|e| e.to_string())?
                .unwrap_or(false);
            if !present {
                continue;
            }
            for tag_id in &tag_ids {
                tx.execute(
                    "INSERT OR IGNORE INTO file_tags (file_id, tag_id) VALUES (?1, ?2)",
                    params![file_id, tag_id],
                )
                .map_err(|e| e.to_string())?;
            }
            let tags = self.tag_string_in_tx(&tx, *file_id)?;
            tx.execute(
                "UPDATE files SET tags_text = ?1 WHERE id = ?2",
                params![tags, file_id],
            )
            .map_err(|e| e.to_string())?;
            updated += 1;
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(updated)
    }
```

The folder behavior does not change. `file_ids_under_folder` already filters `missing = 0`, so the count is the same, and the folder dialog still gets its file count by passing empty tags.

- [ ] **Step 4: Add the command.** In `src-tauri/src/commands/files.rs`, directly after `add_tags_under_folder`:

```rust
#[tauri::command]
async fn add_tags_to_files(app: AppHandle, ids: Vec<i64>, tags: Vec<String>) -> Result<i64, String> {
    let db = app.state::<AppState>().db.clone();
    off_ui("add_tags_to_files", move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        db.add_tags_to_files(&ids, &tags)
    })
    .await
}
```

In `src-tauri/src/lib.rs`, add `add_tags_to_files,` on the line after `add_tags_under_folder,` in `tauri::generate_handler![...]`.

In `src/api.ts`, after `addTagsUnderFolder`:

```ts
  addTagsToFiles: (ids: number[], tags: string[]) =>
    invoke<number>("add_tags_to_files", { ids, tags }),
```

- [ ] **Step 5: Run the tests to verify they pass.**

Run: `cargo test add_tags` (from `src-tauri`)
Expected: `add_tags_to_files_keeps_existing_and_skips_unlisted` and `add_tags_under_folder_keeps_existing_and_skips_siblings` both PASS.

Run: `cargo check --all-targets`
Expected: no warnings or errors.

- [ ] **Step 6: Commit.**

```bash
git add src-tauri/src/db/tags.rs src-tauri/src/db/tests_tags.rs src-tauri/src/commands/files.rs src-tauri/src/lib.rs src/api.ts
git commit -m "Add add_tags_to_files for tagging a list of files"
```

---

### Task 2: Dialogs accept a list of file ids

**Files:**
- Modify: `src/hooks/useLibrary.ts:46-47`
- Modify: `src/hooks/useSessionEffects.ts:55,60,314-323,344-353`
- Modify: `src/components/dialogs/CreatorDialog.tsx`
- Modify: `src/components/dialogs/FolderTagDialog.tsx`
- Test: `src/components/dialogs/CreatorDialog.test.tsx` (new)
- Test: `src/components/dialogs/FolderTagDialog.test.tsx` (new)

**Interfaces:**
- Consumes: `api.addTagsToFiles(ids, tags)` from Task 1, and the existing `api.applyBulkMeta(ids, creator, tags | null)`.
- Produces: `creatorTarget` and `folderTagTarget` both typed `{ folderId: number | null; name: string; fileIds?: number[] } | null`. When `fileIds` is set, the dialogs ignore `folderId` and act on `fileIds`. `name` is shown in bold in the dialog text.

- [ ] **Step 1: Write the failing tests.**

Create `src/components/dialogs/CreatorDialog.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryModel } from "../../hooks/useLibrary";
import { CreatorDialog } from "./CreatorDialog";

const applyBulkMeta = vi.fn();
const setCreatorUnderFolder = vi.fn();

vi.mock("../../api", () => ({
  api: {
    applyBulkMeta: (...args: unknown[]) => applyBulkMeta(...args),
    setCreatorUnderFolder: (...args: unknown[]) => setCreatorUnderFolder(...args),
  },
}));

afterEach(() => {
  cleanup();
  applyBulkMeta.mockReset();
  setCreatorUnderFolder.mockReset();
});

function app(overrides: Record<string, unknown> = {}): LibraryModel {
  return {
    creators: ["Ada"],
    creatorTarget: { folderId: null, name: "2 selected files", fileIds: [1, 2] },
    setCreatorTarget: vi.fn(),
    creatorValue: "Ada",
    setCreatorValue: vi.fn(),
    includeSubfolders: true,
    setIncludeSubfolders: vi.fn(),
    creatorFileCount: 2,
    setError: vi.fn(),
    refreshLists: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as LibraryModel;
}

describe("Creator dialog", () => {
  it("sets the creator on the selected files only", async () => {
    applyBulkMeta.mockResolvedValue(undefined);
    const model = app();
    render(<CreatorDialog app={model} />);
    expect(screen.getByText("2 selected files")).toBeTruthy();
    expect(screen.queryByLabelText("Include subfolders")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(applyBulkMeta).toHaveBeenCalledWith([1, 2], "Ada", null);
    expect(setCreatorUnderFolder).not.toHaveBeenCalled();
    await waitFor(() => expect(model.setCreatorTarget).toHaveBeenCalledWith(null));
    expect(model.refreshLists).toHaveBeenCalled();
  });

  it("keeps the subfolder choice for folder targets", () => {
    setCreatorUnderFolder.mockResolvedValue(1);
    render(<CreatorDialog app={app({ creatorTarget: { folderId: 5, name: "Minis" } })} />);
    expect(screen.getByLabelText("Include subfolders")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(setCreatorUnderFolder).toHaveBeenCalledWith(5, "Ada", true);
    expect(applyBulkMeta).not.toHaveBeenCalled();
  });
});
```

Create `src/components/dialogs/FolderTagDialog.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryModel } from "../../hooks/useLibrary";
import { FolderTagDialog } from "./FolderTagDialog";

const addTagsToFiles = vi.fn();
const addTagsUnderFolder = vi.fn();

vi.mock("../../api", () => ({
  api: {
    addTagsToFiles: (...args: unknown[]) => addTagsToFiles(...args),
    addTagsUnderFolder: (...args: unknown[]) => addTagsUnderFolder(...args),
  },
}));

afterEach(() => {
  cleanup();
  addTagsToFiles.mockReset();
  addTagsUnderFolder.mockReset();
});

function app(overrides: Record<string, unknown> = {}): LibraryModel {
  return {
    tags: ["FDM"],
    folderTagTarget: { folderId: null, name: "2 selected files", fileIds: [1, 2] },
    setFolderTagTarget: vi.fn(),
    folderTagInput: "Terrain, FDM",
    setFolderTagInput: vi.fn(),
    folderTagFileCount: 2,
    setError: vi.fn(),
    refreshLists: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as LibraryModel;
}

describe("Tag dialog", () => {
  it("adds tags to the selected files only", async () => {
    addTagsToFiles.mockResolvedValue(2);
    const model = app();
    render(<FolderTagDialog app={model} />);
    expect(screen.getByRole("heading", { name: "Add tags" })).toBeTruthy();
    expect(screen.getByText("2 selected files")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(addTagsToFiles).toHaveBeenCalledWith([1, 2], ["Terrain", "FDM"]);
    expect(addTagsUnderFolder).not.toHaveBeenCalled();
    await waitFor(() => expect(model.setFolderTagTarget).toHaveBeenCalledWith(null));
    expect(model.refreshLists).toHaveBeenCalled();
  });

  it("still tags a whole folder for folder targets", () => {
    addTagsUnderFolder.mockResolvedValue(3);
    render(<FolderTagDialog app={app({ folderTagTarget: { folderId: 5, name: "Minis" } })} />);
    expect(screen.getByRole("heading", { name: "Tag folder contents" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(addTagsUnderFolder).toHaveBeenCalledWith(5, ["Terrain", "FDM"]);
    expect(addTagsToFiles).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail.**

Run: `npx vitest run src/components/dialogs/CreatorDialog.test.tsx src/components/dialogs/FolderTagDialog.test.tsx`
Expected: the "selected files" tests FAIL. The creator test finds "Include subfolders" and calls `setCreatorUnderFolder`. The tag test can't find the heading "Add tags". The folder-target tests pass already.

- [ ] **Step 3: Widen the target types.**

In `src/hooks/useLibrary.ts`, replace lines 46-47 with:

```ts
  const [folderTagTarget, setFolderTagTarget] = useState<{ folderId: number | null; name: string; fileIds?: number[] } | null>(null);
  const [creatorTarget, setCreatorTarget] = useState<{ folderId: number | null; name: string; fileIds?: number[] } | null>(null);
```

In `src/hooks/useSessionEffects.ts`, change the two parameter types:

```ts
  creatorTarget: { folderId: number | null; name: string; fileIds?: number[] } | null;
```

```ts
  folderTagTarget: { folderId: number | null; name: string; fileIds?: number[] } | null;
```

In the same file, file targets already know their count, so skip the folder query. Replace the creator-count effect:

```ts
  useEffect(() => {
    if (!creatorTarget) {
      setCreatorFileCount(null);
      return;
    }
    if (creatorTarget.fileIds) {
      setCreatorFileCount(creatorTarget.fileIds.length);
      return;
    }
    void api
      .countFilesForScope(creatorTarget.folderId, includeSubfolders)
      .then(setCreatorFileCount)
      .catch((err) => setError(String(err)));
  }, [creatorTarget, includeSubfolders]);
```

and the tag-count effect:

```ts
  useEffect(() => {
    if (!folderTagTarget) {
      setFolderTagFileCount(null);
      return;
    }
    if (folderTagTarget.fileIds) {
      setFolderTagFileCount(folderTagTarget.fileIds.length);
      return;
    }
    void api
      .addTagsUnderFolder(folderTagTarget.folderId, [])
      .then(setFolderTagFileCount)
      .catch((err) => setError(String(err)));
  }, [folderTagTarget]);
```

`useKeyboardShortcuts.ts` declares `folderTagTarget` with the narrower type. That still type-checks because it only tests whether the target is set, so leave it unchanged.

- [ ] **Step 4: Update `CreatorDialog.tsx`.** Replace the file with:

```tsx
import { Modal } from "./Modal";
import type { LibraryModel } from "../../hooks/useLibrary";
import { api } from "../../api";

export function CreatorDialog({ app }: { app: LibraryModel }) {
  const { creators, creatorTarget, setCreatorTarget, creatorValue, setCreatorValue, includeSubfolders, setIncludeSubfolders, creatorFileCount, setError, refreshLists } = app;
  const fileIds = creatorTarget?.fileIds;
  return (
    <>
      {creatorTarget ? (
        <Modal>
          <div className="card">
            <h2>Set creator</h2>
            <p>
              Set the creator on {fileIds ? "" : "files in "}<strong>{creatorTarget.name}</strong>.
            </p>
            {fileIds ? null : (
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={includeSubfolders}
                  onChange={(event) => setIncludeSubfolders(event.target.checked)}
                />
                Include subfolders
              </label>
            )}
            {creatorFileCount === 0 ? <p className="muted">This folder has no files.</p> : null}
            {creatorFileCount != null && creatorFileCount > 0 ? (
              <p className="muted">{creatorFileCount} files will be updated.</p>
            ) : null}
            <input
              placeholder="Creator"
              list="folder-creators"
              value={creatorValue}
              autoFocus
              disabled={creatorFileCount === 0}
              onChange={(event) => setCreatorValue(event.target.value)}
            />
            <datalist id="folder-creators">
              {creators.map((item) => <option key={item} value={item} />)}
            </datalist>
            <div className="row">
              <button type="button" onClick={() => setCreatorTarget(null)}>Cancel</button>
              <button
                type="button"
                className="primary"
                disabled={creatorFileCount === 0 || creatorValue.trim() === ""}
                onClick={() => {
                  const creator = creatorValue.trim();
                  const run: Promise<unknown> = fileIds
                    ? api.applyBulkMeta(fileIds, creator, null)
                    : api.setCreatorUnderFolder(creatorTarget.folderId, creator, includeSubfolders);
                  void run
                    .then(() => refreshLists())
                    .catch((err) => setError(String(err)))
                    .finally(() => setCreatorTarget(null));
                }}
              >
                Apply
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
```

With `tags` set to `null`, `apply_bulk_meta` only updates the creator and leaves tags untouched (`apply_import_meta` in `db/tags.rs`).

- [ ] **Step 5: Update `FolderTagDialog.tsx`.** Replace the file with:

```tsx
import { Modal } from "./Modal";
import type { LibraryModel } from "../../hooks/useLibrary";
import { api } from "../../api";

export function FolderTagDialog({ app }: { app: LibraryModel }) {
  const { tags, folderTagTarget, setFolderTagTarget, folderTagInput, setFolderTagInput, folderTagFileCount, setError, refreshLists } = app;
  const fileIds = folderTagTarget?.fileIds;
  return (
    <>
      {folderTagTarget ? (
        <Modal>
          <div className="card">
            <h2>{fileIds ? "Add tags" : "Tag folder contents"}</h2>
            <p>
              {fileIds ? (
                <>Add tags to <strong>{folderTagTarget.name}</strong>.</>
              ) : (
                <>Add tags to every file in <strong>{folderTagTarget.name}</strong> and its subfolders.</>
              )}
              {" "}Tags already on those files are kept.
            </p>
            {folderTagFileCount === 0 ? <p className="muted">This folder has no files.</p> : null}
            {folderTagFileCount != null && folderTagFileCount > 0 ? (
              <p className="muted">{folderTagFileCount} files will be updated.</p>
            ) : null}
            <input
              placeholder="Tags, separated by commas"
              value={folderTagInput}
              list="folder-tag-suggestions"
              autoFocus
              disabled={folderTagFileCount === 0}
              onChange={(event) => setFolderTagInput(event.target.value)}
            />
            <datalist id="folder-tag-suggestions">
              {tags.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
            <div className="row">
              <button type="button" onClick={() => setFolderTagTarget(null)}>Cancel</button>
              <button
                type="button"
                className="primary"
                disabled={folderTagFileCount === 0}
                onClick={() => {
                  const nextTags = folderTagInput
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean);
                  if (!nextTags.length) {
                    setFolderTagTarget(null);
                    return;
                  }
                  const run: Promise<unknown> = fileIds
                    ? api.addTagsToFiles(fileIds, nextTags)
                    : api.addTagsUnderFolder(folderTagTarget.folderId, nextTags);
                  void run
                    .then(() => refreshLists())
                    .catch((err) => setError(String(err)))
                    .finally(() => setFolderTagTarget(null));
                }}
              >
                Apply
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass.**

Run: `npx vitest run src/components/dialogs/CreatorDialog.test.tsx src/components/dialogs/FolderTagDialog.test.tsx`
Expected: 4 tests PASS.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit.**

```bash
git add src/hooks/useLibrary.ts src/hooks/useSessionEffects.ts src/components/dialogs/CreatorDialog.tsx src/components/dialogs/FolderTagDialog.tsx src/components/dialogs/CreatorDialog.test.tsx src/components/dialogs/FolderTagDialog.test.tsx
git commit -m "Let creator and tag dialogs act on a list of files"
```

---

### Task 3: File context menu items and right-click selection

**Files:**
- Modify: `src/components/dialogs/FileContextMenu.tsx`
- Modify: `src/App.tsx:369-371`
- Test: `src/components/dialogs/FileContextMenu.test.tsx` (new)

**Interfaces:**
- Consumes: `creatorTarget` / `folderTagTarget` with `fileIds` from Task 2, plus the existing `selected`, `files`, `setCreatorValue`, `setFolderTagInput`, and `setFileMenu` on `LibraryModel`.
- Produces: the menu items `Set Creator…` and `Add tags…`.

- [ ] **Step 1: Write the failing test.** Create `src/components/dialogs/FileContextMenu.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryModel } from "../../hooks/useLibrary";
import type { FileRow } from "../../types";
import { FileContextMenu } from "./FileContextMenu";

vi.mock("../../api", () => ({ api: {} }));

afterEach(cleanup);

function app(selected: number[], fileId: number) {
  const calls = {
    setFileMenu: vi.fn(),
    setCreatorTarget: vi.fn(),
    setCreatorValue: vi.fn(),
    setFolderTagTarget: vi.fn(),
    setFolderTagInput: vi.fn(),
  };
  const model = {
    fileMenu: { x: 10, y: 20, fileId },
    selected,
    files: [
      { id: 1, sortName: "benchy" },
      { id: 2, sortName: "cube" },
    ] as FileRow[],
    setError: vi.fn(),
    ...calls,
  } as unknown as LibraryModel;
  return { model, calls };
}

describe("File context menu", () => {
  it("opens Set Creator for every selected file", () => {
    const { model, calls } = app([1, 2], 1);
    render(<FileContextMenu app={model} />);
    fireEvent.click(screen.getByRole("menuitem", { name: "Set Creator…" }));
    expect(calls.setFileMenu).toHaveBeenCalledWith(null);
    expect(calls.setCreatorValue).toHaveBeenCalledWith("");
    expect(calls.setCreatorTarget).toHaveBeenCalledWith({
      folderId: null,
      name: "2 selected files",
      fileIds: [1, 2],
    });
  });

  it("opens Add tags named after a single selected file", () => {
    const { model, calls } = app([2], 2);
    render(<FileContextMenu app={model} />);
    fireEvent.click(screen.getByRole("menuitem", { name: "Add tags…" }));
    expect(calls.setFolderTagInput).toHaveBeenCalledWith("");
    expect(calls.setFolderTagTarget).toHaveBeenCalledWith({
      folderId: null,
      name: "cube",
      fileIds: [2],
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.**

Run: `npx vitest run src/components/dialogs/FileContextMenu.test.tsx`
Expected: FAIL. It can't find a menuitem named "Set Creator…".

- [ ] **Step 3: Add the menu items.** Replace `src/components/dialogs/FileContextMenu.tsx` with:

```tsx
import type { LibraryModel } from "../../hooks/useLibrary";
import { createPortal } from "react-dom";
import { api } from "../../api";

export function FileContextMenu({ app }: { app: LibraryModel }) {
  const {
    fileMenu, setFileMenu, setError, selected, files,
    setCreatorTarget, setCreatorValue, setFolderTagTarget, setFolderTagInput,
  } = app;
  const selectionTarget = (fileId: number) => {
    const fileIds = selected.includes(fileId) ? selected : [fileId];
    const name =
      fileIds.length === 1
        ? files.find((file) => file.id === fileIds[0])?.sortName ?? "1 file"
        : `${fileIds.length} selected files`;
    return { folderId: null, name, fileIds };
  };
  return (
    <>
      {fileMenu
        ? createPortal(
            <div className="file-context-menu" style={{ left: fileMenu.x, top: fileMenu.y }} role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const fileId = fileMenu.fileId;
                  setFileMenu(null);
                  void api.openInDefaultApp(fileId).catch((err) => setError(String(err)));
                }}
              >
                Open
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const fileId = fileMenu.fileId;
                  setFileMenu(null);
                  void api.revealFile(fileId).catch((err) => setError(String(err)));
                }}
              >
                Show in Explorer
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const target = selectionTarget(fileMenu.fileId);
                  setFileMenu(null);
                  setCreatorValue("");
                  setCreatorTarget(target);
                }}
              >
                Set Creator…
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const target = selectionTarget(fileMenu.fileId);
                  setFileMenu(null);
                  setFolderTagInput("");
                  setFolderTagTarget(target);
                }}
              >
                Add tags…
              </button>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
```

- [ ] **Step 4: Select the clicked file the way Explorer does.** In `src/App.tsx`, replace the `FileGrid` `onContextMenu` prop (lines 369-371) with:

```tsx
              onContextMenu={(event, file) => {
                if (!selected.includes(file.id)) onSelect(file.id, "replace");
                setFileMenu({ x: event.clientX, y: event.clientY, fileId: file.id });
              }}
```

- [ ] **Step 5: Run the tests to verify they pass.**

Run: `npx vitest run src/components/dialogs`
Expected: all dialog tests PASS, including the 2 new menu tests.

Run: `npx tsc --noEmit` then `npm run test:unit`
Expected: no type errors, and the full Vitest suite passes.

- [ ] **Step 6: Manual check in the app.** Run `npm run tauri dev`, then:
  1. Ctrl-click 3 files and right-click one of them. The selection stays at 3. Choose **Set Creator…**. The dialog reads "Set the creator on **3 selected files**", says "3 files will be updated", and has no "Include subfolders" checkbox. Enter a creator and click Apply. All 3 tiles show the new creator under their names.
  2. With the same 3 selected, right-click and choose **Add tags…**. Enter `test-bulk` and click Apply. All 3 keep their old tags and gain `test-bulk` (check the Inspector or the tile tooltip).
  3. Right-click a file outside the selection. Only that file is selected, and the menu's dialogs name that file.
  4. Right-click a folder and run **Tag contents…** and **Set Creator…**. Both still work as before, including the subfolder checkbox.

- [ ] **Step 7: Commit.**

```bash
git add src/components/dialogs/FileContextMenu.tsx src/components/dialogs/FileContextMenu.test.tsx src/App.tsx
git commit -m "Add Set Creator and Add tags to the file context menu"
```

---

## Out of scope

- Removing tags from a selection, or replacing tags.
- Adding these items to the native app menu bar or to keyboard shortcuts.
- The "1 files will be updated" wording when one file is selected. This wording already exists for folders with one file and is left as is.
