Status: implemented

# UI fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Import finished recycle button label, keep the Add to library Up button in one place, reset Downloads import settings, and add Duplicate on the file context menu.

**Architecture:** Item 1 is a string change in `ImportSummaryDialog`. The click handler, `recycle_last_import`, and the question sentence stay as they are. Item 2 is picker-only CSS plus a tooltip string. The main-window breadcrumb and the External Programs Up button stay as they are. Item 3 clears the shared creator and tag state when Add to library opens, and starts the destination at the library root. The import summary for the batch that just finished still shows that batch's creator and tags. Item 4 adds a file-only context menu command. Naming is a pure Rust function. The copy is a new file in the same folder, with its own catalog row that copies creator, notes, tags, and the source hash. Later notes from Jason append as the next number. Do not renumber.

**Tech Stack:** React 19, Vitest 5 + v8 (`npm run test:unit`), plain CSS in `src/styles/dialogs.css`, Tauri command plus Rust tests for item 4 (`cargo test` in `src-tauri`). Items 1–3 do not change Rust.

## Global Constraints

- Planning file only until Jason sets an item to in progress. This document does not change product code and does not bump the version.
- Jason develops on Windows 11, PowerShell, repo `D:\GitHub\3DFileManager`. Tests must not assume Unix paths, `/tmp` as a real directory, or a case-sensitive filesystem. Use `node:path` (`join`, `dirname`) and `fileURLToPath` when a test reads a file.
- Unit tests for every new and changed function, with the existing Vitest gate in `vitest.config.ts`: statements, branches, functions, and lines all ≥ 80. `npm run test:unit` is the executed-coverage command.
- After the implementation diff exists, run `.cursor/skills/graph-coverage` (static name linkage, not executed coverage), add tests for gaps in the new and changed symbols, and run it again. `covers` edges match names in test source. They are not line or branch coverage. Names like `open` can over-link.
- After implementation, run `/review-bugbot` on that PR and address findings before merge. This plan PR is not that review.
- Karpathy: minimal focused diffs. No new component, no recycle-behavior change, no hand-edited version fields, no drive-by refactors.
- Version changes happen only through `npm run version:bump` (`scripts/version.mjs`), which writes `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `src-tauri/Cargo.lock` together. One bump per implementation PR, after tests pass. Do not edit those version fields by hand.
- Items 1, 2, 3, and 4 are independent. One commit per item, one implementation PR, unless a later item is large enough to split. Rust tests for item 4 use `std::env::temp_dir` the way `src-tauri/src/db/tests_files.rs` already does. Do not hard-code `/tmp`.

## How to add the next item

Append `### N. Short name` with N = one more than the last item. Do not reuse or reorder numbers. Each item needs: what Jason saw, exact components / strings / CSS, the code change, tests, and a PowerShell check. Set that item's status to `not started` until implementation begins.

---

### 1. Import finished — recycle button label

**Status:** implemented

**What Jason saw.** Import finished dialog, text `Imported 1. Duplicates 0. Left in place 0.`, buttons `Keep originals` and `Undo import of 1 file (Recycle Bin)`. The second label is wrong. It must be exactly `Move to Recycle Bin` for every `recycleCount` (no count, no plural).

**Files:**

- Modify: `src/components/dialogs/ImportSummaryDialog.tsx` (button text only, around the second button)
- Modify: `src/components/dialogs/ImportSummaryDialog.test.tsx` (the test that clicks `Undo import of 2 files (Recycle Bin)`)
- Do not modify: `src-tauri/src/commands/files.rs`, `src-tauri/src/import/cleanup.rs`, `src-tauri/src/import/store.rs`, `src-tauri/src/import/plan.rs`, `src-tauri/src/import/archive.rs`, `src/api.ts`

**Strings that stay:**

| Where | Exact text |
| --- | --- |
| `ImportSummaryDialog.tsx` heading | `Import finished` (or `Import stopped` when `summary.cancelled`) |
| Counts line | `Imported {n}. Duplicates {n}. Left in place {n}.` |
| Question, only when `summary.recycleCount > 0` | `Keep those originals, or move the imported files and duplicates to the Recycle Bin?` |
| Primary button | `Keep originals` |
| Disk op in the second button's `runDiskOp` | title `Moving originals to the Recycle Bin...`, success `Originals moved to the Recycle Bin`, cancelled `Recycle cancelled` |

**What the second button actually does.** Label aside, the handler in `ImportSummaryDialog` is:

1. Read `summary.importedIds`.
2. If `importMetaPayload` returns a payload (creator and/or tags, including comma-separated text still in the field via `appendCommaTags`), call `api.applyBulkMeta`, then `refreshLists`. Same meta save as `Keep originals`.
3. `setSummary(null)` closes the dialog.
4. `runDiskOp({ title, cancellable: true, success, cancelled, run })`. `run` calls `api.recycleLastImport()` (`src/api.ts`), which invokes the Tauri command `recycle_last_import`.
5. If that outcome is not cancelled and `failed.length > 0`, `run` throws `outcome.failed.join("\n")`.
6. If `applyBulkMeta` throws, `setError` runs and the dialog stays open. `recycleLastImport` is not called.

`recycle_last_import` (`src-tauri/src/commands/files.rs`, `recycle_last_import`) copies `AppState.last_recycle_paths` and `last_recycle_roots` (stashed at the end of `import_paths` by `record_import_recycle_targets` in `src-tauri/src/commands/import_cmd.rs`) and calls `recycle_last_import_work` → `recycle_paths_work` → `import::recycle_paths_with` (`src-tauri/src/import/cleanup.rs`).

`recycle_paths_with` sends each path that `is_file()` to the OS Recycle Bin with `trash::delete`. A path that `is_dir()` is skipped. After the files that succeeded, `prune_emptied_subfolders` deletes emptied source subfolders under `recycle_roots` with a normal directory remove. Those folders are not sent to the Recycle Bin. The import root directory stays.

Paths in `last_recycle_paths` are **source originals**, not the copies now in the library (`remember_recycle` in `src-tauri/src/import/store.rs` pushes `source`). They are added when `can_recycle` is true:

- A loose file import passes `can_recycle: true` (`src-tauri/src/import/plan.rs`, the non-archive branch).
- A file from a folder import passes `source_archive.is_none()` (`import_tree` in the same file).
- A duplicate (hash already in the library) is included the same way, and `duplicate_count` increments. The library copy is not created again.
- A successful or duplicate-matching archive adds the **archive file** itself (`src-tauri/src/import/archive.rs`). Extracted files are temp files and are not listed (`can_recycle` is false when `source_archive` is set).
- Unsupported files and files that failed to import are not listed. They stay on disk. `leftInPlace` counts those. `recycleCount` is `recycle_paths.len()`, which can be larger than `importedCount` when duplicates are included.

`Keep originals` does steps 1–2 and closes. It does not call `recycleLastImport`.

**Mismatch between the new label and the behavior.** The new label matches the action: files go to the Recycle Bin, and the import is not undone. The library copies stay. Do not change the handler to match the old words "Undo import".

Flag these and leave them:

- The question says "move the imported files and duplicates". The code moves source originals (imported sources, duplicate sources, and the archive file), not the library copies. The disk-op strings already say "originals", which matches the code. The question is the sentence that still reads like the library copies move. Do not rewrite it in this item. A later item can, if Jason wants. A possible later sentence is `Keep those originals, or move them to the Recycle Bin?` — not part of this change.
- The label does not mention that both buttons save creator/tags first. That save stays.
- The label does not mention `prune_emptied_subfolders`. That cleanup stays.
- The old label interpolated `recycleCount`, which includes duplicates, not only `importedCount`. The new label drops the count on purpose. For Jason's example (imported 1, duplicates 0) the count was 1 either way.

**Interfaces:**

- Consumes: existing `ImportSummaryDialog` props and `api.recycleLastImport(): Promise<{ failed: string[]; cancelled: boolean }>`.
- Produces: visible button name `Move to Recycle Bin` when `recycleCount > 0`. No new export.

- [ ] **Step 1: Write the failing test**

In `src/components/dialogs/ImportSummaryDialog.test.tsx`, change the test named `runs recycle through runDiskOp when originals should be removed` so it requires the exact label and rejects the old one. Replace the click target and add the assertions below. Keep the existing `recycleLastImport` / `runDiskOp` expectations.

```tsx
it("names the recycle button Move to Recycle Bin and still recycles originals", async () => {
  recycleLastImport.mockResolvedValue({ cancelled: false, failed: [] });
  const runDiskOp = vi.fn(async (opts: { run: () => Promise<unknown> }) => {
    await opts.run();
  });
  const { rerender } = render(
    <ImportSummaryDialog
      app={app({
        summary: { ...summary(), importedCount: 1, importedIds: [8], recycleCount: 1 },
        runDiskOp,
      })}
    />,
  );
  expect(screen.getByRole("heading", { name: "Import finished" })).toBeTruthy();
  expect(screen.getByText("Imported 1. Duplicates 0. Left in place 0.")).toBeTruthy();
  expect(
    screen.getByText("Keep those originals, or move the imported files and duplicates to the Recycle Bin?"),
  ).toBeTruthy();
  const move = screen.getByRole("button", { name: "Move to Recycle Bin" });
  expect(move.textContent).toBe("Move to Recycle Bin");
  expect(screen.queryByRole("button", { name: /Undo import/ })).toBeNull();
  fireEvent.click(move);
  await waitFor(() => expect(recycleLastImport).toHaveBeenCalledTimes(1));
  expect(runDiskOp).toHaveBeenCalledWith(
    expect.objectContaining({
      title: "Moving originals to the Recycle Bin...",
      success: "Originals moved to the Recycle Bin",
      cancelled: "Recycle cancelled",
      cancellable: true,
    }),
  );
  expect(screen.getByRole("button", { name: "Keep originals" })).toBeTruthy();

  rerender(
    <ImportSummaryDialog
      app={app({
        summary: { ...summary(), recycleCount: 2 },
        runDiskOp,
      })}
    />,
  );
  expect(screen.getByRole("button", { name: "Move to Recycle Bin" }).textContent).toBe("Move to Recycle Bin");
  expect(screen.queryByRole("button", { name: /Undo import of 2 files/ })).toBeNull();
});
```

The default `summary()` in that file has `recycleCount: 0`. Add one assertion to an existing render (the "opens with the creator" test is enough) that `screen.queryByRole("button", { name: "Move to Recycle Bin" })` is `null` when nothing can be recycled.

- [ ] **Step 2: Run the test to verify it fails**

```powershell
Set-Location D:\GitHub\3DFileManager
npm run test:unit -- src/components/dialogs/ImportSummaryDialog.test.tsx
```

Expected: FAIL, unable to find a button named `Move to Recycle Bin`.

- [ ] **Step 3: Change only the button text**

In `src/components/dialogs/ImportSummaryDialog.tsx`, replace the second button's children:

```tsx
Move to Recycle Bin
```

Delete the expression `Undo import of {summary.recycleCount} file{summary.recycleCount === 1 ? "" : "s"} (Recycle Bin)`. Leave the `summary.recycleCount > 0` condition, both handlers, the question `<p>`, and the `runDiskOp` strings unchanged.

- [ ] **Step 4: Run the test to verify it passes**

```powershell
npm run test:unit -- src/components/dialogs/ImportSummaryDialog.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/components/dialogs/ImportSummaryDialog.tsx src/components/dialogs/ImportSummaryDialog.test.tsx
git commit -m "fix: label import recycle button Move to Recycle Bin"
```

---

### 2. Add to library — Up button stays put

**Status:** implemented

**What Jason saw.** Add to library dialog (`1 file will be copied into the library`, breadcrumb like `3D Print Library > FDM Prints > Toys`, an Up button, a `Copy into: ...` line, a folder tree). With a short path, Up sits on the right of the breadcrumb. With a long path (`... > Articulated Toys > Dummy 13 > dummy-13`) Up drops onto its own line and a horizontal scrollbar appears.

**Cause.** `FolderPicker` lays the breadcrumb and Up out in `.folder-picker-toolbar` (`src/components/FolderPicker.tsx`). `src/styles/dialogs.css` sets that toolbar to `flex-wrap: wrap` and `justify-content: space-between`. The picker breadcrumb is `flex: 1 1 auto` (basis = the full path width) with `overflow-x: auto`, and `.folder-picker-toolbar .breadcrumb-part` / `.breadcrumb-segment` are `flex: 0 0 auto`, so segments do not shrink. A short path fits beside Up on one row. A long path's flex base is wider than the card (`src/styles/dialogs.css`: `.card` is `width: min(460px, calc(100% - 32px))`), so the breadcrumb takes the first row, scrolls horizontally, and Up wraps to the next row. `.card.card-add-library { overflow: auto }` can show a second scrollbar when the toolbar's min-content is the full path. `.folder-picker` has no `min-width: 0`, so that min-content is allowed to expand the column.

The workspace rule `.breadcrumb-segment { max-width: 16rem; text-overflow: ellipsis }` (`src/styles/workspace.css`) ellipsizes one long name. It does not stop several segments from adding up past the card.

**Copy into line.** `FolderPicker` renders:

```tsx
<p className="folder-picker-destination" aria-live="polite" title={destination}>
  Copy into: {destination}
</p>
```

`destination` comes from `destinationDisplayPath` (`src/lib/folderPicker.ts`) and uses ` / ` separators, for example `3D Print Library / FDM Prints / Toys`. The breadcrumb uses ` > `. Keep both separators.

`.folder-picker-destination` already has `min-width: 0`, `overflow: hidden`, `text-overflow: ellipsis`, and `white-space: nowrap`. Once the picker is width-constrained, that line ellipsizes instead of widening the card. Its `title` is the path only, so a truncated line's tooltip omits the `Copy into: ` prefix. Set `title` to the same string the line shows.

**Approaches.**

1. Recommended. `flex-wrap: nowrap`, breadcrumb `flex: 1 1 0%` and `min-width: 0`, `overflow: hidden` (not `overflow-x: auto`), `text-overflow: ellipsis`, Up `flex: 0 0 auto`. Tooltip on the picker breadcrumb is the full ` > ` path. `fullPath` stays, so every segment remains in the DOM. The clip is on the right (the deepest names). Copy into and the tooltip still show them.
2. Rejected. Drop `fullPath` and use `truncateCrumbs` (`src/lib/breadcrumb.ts`, root + `…` + last two). That hides middle folders, is based on segment count rather than width, and breaks `AddToLibraryDialog.test.tsx` / `FolderPicker.test.tsx` expectations that a deep path has no `…` text node.
3. Rejected. `ResizeObserver` to collapse crumbs. More code than the layout bug needs, and jsdom does not measure it.

**Do not change:**

- `src/styles/workspace.css` (main window breadcrumb).
- `src/components/dialogs/ExternalProgramsDialog.tsx` (its Up button reorders programs; visible text `Up`, `aria-label` `Move ${program.name} up`).
- `AddToLibraryDialog.tsx` structure. It already renders one `FolderPicker`. The heading `Add to library` and the line `{n} file(s) will be copied into the library.` stay.
- Up's visible text `Up` and `aria-label` `Up one folder`.

**Files:**

- Modify: `src/styles/dialogs.css` (`.folder-picker`, `.folder-picker-toolbar`, `.folder-picker-toolbar .breadcrumb`, the part/segment override, `.folder-picker-up`, `.folder-picker-destination`)
- Modify: `src/lib/breadcrumb.ts` (add `breadcrumbTitle`)
- Modify: `src/components/Breadcrumb.tsx` (title only when `fullPath` is true)
- Modify: `src/components/Breadcrumb.test.tsx`
- Modify: `src/components/FolderPicker.tsx` (destination `title` only)
- Modify: `src/components/FolderPicker.test.tsx`
- Create: `src/styles/dialogs.folder-picker.test.ts`
- Test already in place: `src/components/dialogs/AddToLibraryDialog.test.tsx` deep-path case must keep `queryByText("…")` null. Do not edit it unless the assertion fails.

**Interfaces:**

- Consumes: `folderCrumbs` and `Crumb` from `src/lib/breadcrumb.ts`. `FolderPicker` already passes `fullPath` to `Breadcrumb`.
- Produces: `export function breadcrumbTitle(crumbs: Crumb[]): string`. Place crumbs joined with `" > "`. Ellipsis crumbs are omitted. Callers that need the full path must pass the untruncated `folderCrumbs` result.

- [ ] **Step 1: Write the failing tests**

`src/lib/breadcrumb.ts` function, tested from `src/components/Breadcrumb.test.tsx` (that file already imports the breadcrumb helpers):

```ts
export function breadcrumbTitle(crumbs: Crumb[]): string {
  return crumbs
    .filter((crumb): crumb is Extract<Crumb, { kind: "place" }> => crumb.kind === "place")
    .map((crumb) => crumb.label)
    .join(" > ");
}
```

```tsx
it("joins place crumbs for the picker tooltip and skips an ellipsis", () => {
  const crumbs = folderCrumbs("3D Print Library", library, { type: "folder", id: 5 });
  expect(breadcrumbTitle(crumbs)).toBe(
    "3D Print Library > Toys > Articulated Toys > Flexi Animals > Wolves > Dire Wolf",
  );
  expect(breadcrumbTitle(truncateCrumbs(crumbs))).toBe("3D Print Library > Wolves > Dire Wolf");
});
```

In the existing test `shows every ancestor when fullPath is set`, add:

```tsx
expect(screen.getByRole("navigation", { name: "Folder path" }).getAttribute("title")).toBe(
  "3D Print Library > Toys > Articulated Toys > Flexi Animals > Wolves > Dire Wolf",
);
```

In the existing test `navigates when a segment is clicked` (no `fullPath`), add:

```tsx
expect(screen.getByRole("navigation", { name: "Folder path" }).hasAttribute("title")).toBe(false);
```

In `src/components/FolderPicker.test.tsx`, inside `shows every breadcrumb on a deep path and does not mark the chevron expanded`, add:

```tsx
expect(screen.getByRole("navigation", { name: "Folder path" }).getAttribute("title")).toBe(
  "Library > L1 > L2 > L3 > L4 > L5",
);
const copyInto = screen.getByText("Copy into: Library / L1 / L2 / L3 / L4 / L5");
expect(copyInto.getAttribute("title")).toBe("Copy into: Library / L1 / L2 / L3 / L4 / L5");
const toolbar = document.querySelector(".folder-picker-toolbar");
expect(toolbar?.querySelector(".breadcrumb")).toBe(toolbar?.children[0]);
expect(toolbar?.querySelector(".folder-picker-up")).toBe(toolbar?.children[1]);
```

Create `src/styles/dialogs.folder-picker.test.ts`. jsdom does not wrap flex lines, so this test locks the CSS that stops the wrap. `node:path` keeps it Windows-safe.

```ts
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function ruleBlock(css: string, selector: string): string {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`missing ${selector}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

describe("folder picker toolbar layout", () => {
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "dialogs.css"), "utf8");

  it("pins Up on one row and ellipsizes the breadcrumb", () => {
    const picker = ruleBlock(css, ".folder-picker {");
    expect(picker).toContain("min-width: 0");
    const toolbar = ruleBlock(css, ".folder-picker-toolbar {");
    expect(toolbar).toContain("flex-wrap: nowrap");
    expect(toolbar).toContain("min-width: 0");
    expect(toolbar).not.toContain("flex-wrap: wrap");
    const crumb = ruleBlock(css, ".folder-picker-toolbar .breadcrumb {");
    expect(crumb).toContain("display: block");
    expect(crumb).toContain("flex: 1 1 0%");
    expect(crumb).toContain("min-width: 0");
    expect(crumb).toContain("overflow: hidden");
    expect(crumb).toContain("text-overflow: ellipsis");
    expect(crumb).toContain("white-space: nowrap");
    expect(crumb).not.toContain("overflow-x: auto");
    const parts = ruleBlock(css, ".folder-picker-toolbar .breadcrumb-part,");
    expect(parts).toContain("max-width: 100%");
    expect(parts).not.toContain("flex: 0 0 auto");
    const up = ruleBlock(css, ".folder-picker-up {");
    expect(up).toContain("flex: 0 0 auto");
    const dest = ruleBlock(css, ".folder-picker-destination {");
    expect(dest).toContain("min-width: 0");
    expect(dest).toContain("overflow: hidden");
    expect(dest).toContain("text-overflow: ellipsis");
    expect(dest).toContain("white-space: nowrap");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```powershell
npm run test:unit -- src/components/Breadcrumb.test.tsx src/components/FolderPicker.test.tsx src/styles/dialogs.folder-picker.test.ts
```

Expected: FAIL. `breadcrumbTitle` is not exported, the navigation has no `title`, the destination `title` is the path without `Copy into: `, and `dialogs.css` still has `flex-wrap: wrap` and `overflow-x: auto`.

- [ ] **Step 3: Implement the minimal layout**

Add `breadcrumbTitle` to `src/lib/breadcrumb.ts` exactly as in Step 1.

In `src/components/Breadcrumb.tsx`, build the full crumb list once and title only the picker:

```tsx
const allCrumbs = folderCrumbs(libraryName, folders, browse);
const crumbs = fullPath ? allCrumbs : truncateCrumbs(allCrumbs);
```

On the `<nav>`:

```tsx
<nav
  className="breadcrumb"
  aria-label="Folder path"
  title={fullPath ? breadcrumbTitle(allCrumbs) : undefined}
>
```

Import `breadcrumbTitle` next to `folderCrumbs` and `truncateCrumbs`.

In `src/components/FolderPicker.tsx`, next to the existing `const destination = ...` line, add the label const and use it on the paragraph:

```tsx
const destinationLabel = `Copy into: ${destination}`;
```

```tsx
<p className="folder-picker-destination" aria-live="polite" title={destinationLabel}>
  {destinationLabel}
</p>
```

Replace the picker rules in `src/styles/dialogs.css` with:

```css
.folder-picker {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
  min-height: 0;
}

.folder-picker-toolbar {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.folder-picker-toolbar .breadcrumb {
  display: block;
  flex: 1 1 0%;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-picker-toolbar .breadcrumb-part,
.folder-picker-toolbar .breadcrumb-segment {
  display: inline-flex;
  vertical-align: middle;
  flex: 0 1 auto;
  min-width: 0;
  max-width: 100%;
}

.folder-picker-up {
  flex: 0 0 auto;
}

.folder-picker-destination {
  font-size: 13px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

`display: block` on the picker breadcrumb is what lets `text-overflow: ellipsis` draw one ellipsis. The shared `.breadcrumb` rule is `display: flex`, and a flex row of buttons clips without an ellipsis glyph. `overflow: hidden` replaces `overflow-x: auto`, which is the horizontal scrollbar. Leave `.card.card-add-library { overflow: auto }` so a short window can still scroll the dialog vertically.

- [ ] **Step 4: Run the tests to verify they pass**

```powershell
npm run test:unit -- src/components/Breadcrumb.test.tsx src/components/FolderPicker.test.tsx src/components/dialogs/AddToLibraryDialog.test.tsx src/styles/dialogs.folder-picker.test.ts
```

Expected: PASS, including the deep-path test that still finds no `…` text node.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/breadcrumb.ts src/components/Breadcrumb.tsx src/components/Breadcrumb.test.tsx src/components/FolderPicker.tsx src/components/FolderPicker.test.tsx src/styles/dialogs.css src/styles/dialogs.folder-picker.test.ts
git commit -m "fix: keep the Add to library Up button on one row"
```

---

### 3. Downloads — reset Add to library for every import

**Status:** implemented

**What Jason saw.** Importing more than one file from Downloads, one Add to library after another. The next dialog still has the previous import's destination folder, source field (`Maker World`), and tags (`Angels, FDM`). Each new import must start from defaults.

One context-menu selection of several files is still one import: one dialog, one `importPaths` call, one destination, one creator, one tag set (`DownloadsContextMenu` calls `openAddToLibrary(menu.selection)`). This item does not split that batch. The reset is the next time the dialog opens.

**Where the state lives.** Nothing is written to settings or disk.

| What Jason called it | State | Where | Initial value |
| --- | --- | --- | --- |
| Source field (`Maker World`) | `importCreator: string` | `useLibrary` `useState`, line 65 of `src/hooks/useLibrary.ts` | `""` |
| Tags (`Angels`, `FDM` chips) | `importTags: string[]` | same hook, line 66 | `[]` |
| Tags still typed in the box (`Angels, FDM`) | `importTagText: string` | same hook, line 67 | `""` |
| Destination folder | `browse` inside `AddToLibraryDialog` | `useState`, seeded from the `defaultPlace` prop | see below |

The source field is the creator input. `ImportMetaFields` has no separate source control. Placeholder: `Creator for all imported files`. The same three values are passed into `ImportSummaryDialog`, so the summary and the next Add to library dialog are the same state.

**Why creator and tags persist.** `runImport` (drop or folder import) clears all three before `setSummary` (`useLibrary.ts` around lines 434–436). `runDownloadsImport` (around lines 454–484) does not. It leaves them so the summary opens pre-filled. That was explicit in `docs/plans/downloads-folder.md` ("Leave `importCreator`, `importTags`, and `importTagText` as entered") and is locked by the test `imports into the dialog folder, keeps creator and tags, and opens the summary` in `src/hooks/useLibrary.test.tsx`. Cancel only sets `addToLibraryPaths` to null (`App.tsx`), so a cancelled draft stays in the hook too.

Do not clear inside `runDownloadsImport`. `Keep originals` and `Move to Recycle Bin` read `importCreator`, `importTags`, and `importTagText` when they call `applyBulkMeta`. Clearing before `setSummary` would drop `Maker World` and `Angels, FDM` before they are saved onto the files just imported.

**Why the destination persists.** `AddToLibraryDialog` drops its local `browse` when it unmounts. The next open copies `defaultPlace`. `App.tsx` passes `defaultPlace={defaultImportDestination}`, and the hook sets that to `defaultImportDestination(history)` (`useLibrary.ts` return value). The function in `src/lib/downloadsImport.ts` walks `history.back` from the end and returns the last place whose type is not `"downloads"`, or `{ type: "root" }`.

After a successful Downloads import (`importedCount > 0`), `runDownloadsImport` calls `setBrowse` to that folder. `setBrowse` is `pushFolder`. The user then opens Downloads again from the sidebar, which pushes `{ type: "downloads" }` on top of that folder. The last non-Downloads place is now the folder just imported into, so the next dialog opens there. The wiki states this rule today (`docs/wiki/Importing.md`: "The default is the library folder you last had open before Downloads, or the library root"). A successful import leaves Downloads, so the next visit's "folder before Downloads" is the previous import's destination. Root is the only destination that is empty on every new dialog.

**Defaults for every new Add to library dialog.**

| Field | Default |
| --- | --- |
| `importCreator` | `""` |
| `importTags` | `[]` |
| `importTagText` | `""` |
| Destination `browse` | `{ type: "root" }` (breadcrumb is the library name only, for example `3D Print Library`; `Copy into: 3D Print Library`) |

The summary for the import that just finished still shows the creator and tags from that dialog until it is closed. The next Add to library, including one opened after Cancel, starts from the table above. A multi-file selection still shares one filled-in dialog for that batch.

**Files:**

- Modify: `src/hooks/useLibrary.ts` (`openAddToLibrary` only)
- Modify: `src/hooks/useLibrary.test.tsx`
- Modify: `src/App.tsx` (pass `defaultPlace={{ type: "root" }}`; drop `defaultImportDestination` from the destructure)
- Modify: `src/App.test.tsx`
- Modify: `src/components/dialogs/AddToLibraryDialog.test.tsx` (new-path reset when `defaultPlace` is root)
- Delete: `defaultImportDestination` from `src/lib/downloadsImport.ts`, and delete `src/lib/downloadsImport.test.ts` (that file only tests it). Remove the now-unused `FolderHistory` import in `downloadsImport.ts`.
- Modify: `docs/wiki/Importing.md` step 2 and step 3 so they match the new defaults
- Do not modify: `runDownloadsImport`, `ImportMetaFields.tsx`, `ImportSummaryDialog.tsx` handlers, `docs/plans/downloads-folder.md` (that file records the old decision)

**Interfaces:**

- Consumes: `openAddToLibrary(paths: string[]) => void`. Empty `paths` still returns without changing state.
- Produces: no new export. `defaultImportDestination` is removed. Callers use `{ type: "root" }`.

- [ ] **Step 1: Write the failing tests**

In `src/hooks/useLibrary.test.tsx`, extend `ignores empty add-to-library paths` so an empty selection does not wipe a draft:

```tsx
act(() => {
  result.current.setImportCreator("Maker World");
  result.current.setImportTags(["Angels", "FDM"]);
  result.current.setImportTagText("Angels, FDM");
  result.current.openAddToLibrary([]);
});
expect(result.current.addToLibraryPaths).toBeNull();
expect(result.current.importCreator).toBe("Maker World");
expect(result.current.importTags).toEqual(["Angels", "FDM"]);
expect(result.current.importTagText).toBe("Angels, FDM");
```

Add this test next to `imports into the dialog folder, keeps creator and tags, and opens the summary`. Paths are plain strings. The test must not touch the filesystem.

```tsx
it("clears creator and tags when the next Add to library opens", async () => {
  api.bootstrap.mockResolvedValue({ settings, folders: [], missingCount: 0 });
  mockCatalog();
  api.listDownloads.mockResolvedValue({ status: "ok", rows: [], truncated: false });
  api.importPaths.mockResolvedValue({
    importedIds: [9],
    importedCount: 1,
    duplicateCount: 0,
    unsupportedCount: 0,
    failed: [],
    recycleCount: 0,
    leftInPlace: 0,
    cancelled: false,
    pendingHashCount: 0,
  });
  const { result } = renderHook(() => useLibrary(), { wrapper });
  await waitFor(() => expect(result.current.ready).toBe(true));
  act(() => {
    result.current.setImportCreator("Maker World");
    result.current.setImportTags(["Angels", "FDM"]);
    result.current.setImportTagText("Angels, FDM");
    result.current.setBrowse({ type: "downloads" });
  });
  await waitFor(() => expect(result.current.browse).toEqual({ type: "downloads" }));
  await act(async () => {
    await result.current.runDownloadsImport(["D:\\Downloads\\a.stl"], 2);
  });
  expect(result.current.importCreator).toBe("Maker World");
  expect(result.current.importTags).toEqual(["Angels", "FDM"]);
  expect(result.current.importTagText).toBe("Angels, FDM");
  expect(result.current.summary?.importedIds).toEqual([9]);
  act(() => {
    result.current.openAddToLibrary(["D:\\Downloads\\b.stl"]);
  });
  expect(result.current.addToLibraryPaths).toEqual(["D:\\Downloads\\b.stl"]);
  expect(result.current.importCreator).toBe("");
  expect(result.current.importTags).toEqual([]);
  expect(result.current.importTagText).toBe("");
});
```

In `src/components/dialogs/AddToLibraryDialog.test.tsx`:

```tsx
it("returns to the library root when the next file opens there", () => {
  const model = app();
  const { rerender } = render(
    <AddToLibraryDialog
      app={model}
      paths={["D:\\Downloads\\a.stl"]}
      defaultPlace={{ type: "root" }}
      onClose={() => undefined}
    />,
  );
  fireEvent.click(screen.getByRole("option", { name: "Terrain" }));
  expect(copyIntoLine()).toBe("Copy into: 3D Print Library / Terrain");
  rerender(
    <AddToLibraryDialog
      app={model}
      paths={["D:\\Downloads\\b.stl"]}
      defaultPlace={{ type: "root" }}
      onClose={() => undefined}
    />,
  );
  expect(copyIntoLine()).toBe("Copy into: 3D Print Library");
});
```

In `src/App.test.tsx`, render `AppShell` through `libraryModel` with `addToLibraryPaths: ["D:\\Downloads\\a.stl"]`, `libraryName: "3D Print Library"`, `folders: [{ id: 2, parentId: null, name: "Toys", relpath: "Toys", sortOrder: 0 }]`, `defaultImportDestination: { type: "folder", id: 2 }`, `importCreator: ""`, `importTags: []`, `importTagText: ""`, `creators: []`, `tags: []`, no-op setters, and `runDownloadsImport: async () => true`. Assert `screen.getByText("Copy into: 3D Print Library")` (exact match, so `Copy into: 3D Print Library / Toys` does not pass). The clear of `Maker World` is the hook test. This App test only locks the destination prop.

- [ ] **Step 2: Run the tests to verify they fail**

```powershell
Set-Location D:\GitHub\3DFileManager
npm run test:unit -- src/hooks/useLibrary.test.tsx src/components/dialogs/AddToLibraryDialog.test.tsx src/App.test.tsx src/lib/downloadsImport.test.ts
```

Expected: FAIL. After `openAddToLibrary(["D:\\Downloads\\b.stl"])`, `importCreator` is still `Maker World`. The App test finds `Copy into: 3D Print Library / Toys` because `App.tsx` still passes `defaultImportDestination`. The dialog rerender test passes already: `pathKey` resets `browse` to `defaultPlace`. Keep that test so a later edit cannot leave the previous folder selected.

- [ ] **Step 3: Reset on open, and start at the library root**

`openAddToLibrary` in `src/hooks/useLibrary.ts`:

```tsx
const openAddToLibrary = useCallback((paths: string[]) => {
  if (paths.length === 0) return;
  setImportCreator("");
  setImportTags([]);
  setImportTagText("");
  setAddToLibraryPaths([...paths]);
}, []);
```

Leave `runDownloadsImport` unchanged, including `setBrowse(next.place)` after a non-zero import.

In `src/App.tsx`, remove `defaultImportDestination` from the destructure and pass:

```tsx
defaultPlace={{ type: "root" }}
```

Delete `defaultImportDestination` from `src/lib/downloadsImport.ts` and from the `useLibrary` import and return value. Delete `src/lib/downloadsImport.test.ts`.

In `docs/wiki/Importing.md`, replace the destination and creator sentences under From Downloads with: the destination starts at the library root every time Add to library opens; creator and tags start empty. The import summary still shows the creator and tags entered for that batch.

- [ ] **Step 4: Run the tests to verify they pass**

```powershell
npm run test:unit -- src/hooks/useLibrary.test.tsx src/components/dialogs/AddToLibraryDialog.test.tsx src/App.test.tsx src/lib/downloadsImport.navigation.test.ts
```

Expected: PASS. `downloadsImport.test.ts` is gone, so it is not in this command.

- [ ] **Step 5: Commit**

```powershell
git add src/hooks/useLibrary.ts src/hooks/useLibrary.test.tsx src/App.tsx src/App.test.tsx src/lib/downloadsImport.ts src/components/dialogs/AddToLibraryDialog.test.tsx docs/wiki/Importing.md
git add -u src/lib/downloadsImport.test.ts
git commit -m "fix: reset Add to library fields for each Downloads import"
```

---

### 4. Duplicate a file from the context menu

**Status:** implemented

**What Jason saw.** The file right-click menu needs a `Duplicate` item. It applies to files only, not folders. The copy stays in the same folder. The new name inserts ` (N)` before the extension: `part.stl` becomes `part (1).stl`. If the stem already ends in ` (N)`, use the next free number: `part (1).stl` becomes `part (2).stl`. Numbers that already exist are skipped.

**Where the menu is built.** Library files use `FileContextMenu` (`src/components/dialogs/FileContextMenu.tsx`), portaled from `App.tsx`. The grid opens it in `App.tsx` `onContextMenu`: if the clicked file is not in `selected`, the selection is replaced with that file, then `setFileMenu({ x, y, fileId })`. Current items, in order: `Open in…`, `Show in Explorer`, `Rename`, `Set Creator…`, `Add tags…`. `Rename` and `Open in…` use only `fileMenu.fileId`. `Set Creator…` and `Add tags…` use `selectionTarget`: every `selected` id when the clicked id is inside the selection, otherwise just the clicked id.

Folders use `FolderContextMenu` (`src/components/dialogs/FolderContextMenu.tsx`): `New folder`, `Rename`, `Delete`, `Tag contents…`, `Set Creator…`, `Show in Explorer`, `Rescan`. Sidebar folders and grid folders both use that menu. Do not add `Duplicate` there.

Downloads rows use `DownloadsContextMenu` (`Add to library`, `Show in Explorer`). Those paths are not library files. Do not add `Duplicate` there.

**Naming.** Do not call `unique_file_path` in `src-tauri/src/names.rs`. That helper, on a collision, starts at ` (2)` and never produces ` (1)`.

Add `duplicate_file_name(file_name: &str, taken: &[String]) -> Result<String, String>` in `names.rs`. `taken` is file names already in that folder plus names reserved earlier in the same batch. Compare with `to_ascii_lowercase`, the same ASCII case folding SQLite `COLLATE NOCASE` uses. No new crate. Parse by hand.

Split the extension the way `std::path::Path` does. The extension is the text after the last dot, with its original case kept in the new file name. The catalog `ext` column stays lowercase. A leading-dot name such as `.gitignore` has no extension (`file_stem` is the whole name). An empty stem means there is no extension split.

A numbered stem matches only a final ` (N)` where `N` is a decimal integer with no leading zero (`[1-9]\d*`), the base before that suffix is non-empty, and the base does not end in a space or a period. Otherwise the whole stem is the base and the first number is 1.

| Source | Taken | Result | Why |
| --- | --- | --- | --- |
| `part.stl` | none | `part (1).stl` | first copy starts at 1 |
| `part.stl` | `part (1).stl` | `part (2).stl` | 1 exists |
| `part (1).stl` | none | `part (2).stl` | already numbered, start at N+1 |
| `part (1).stl` | `part (2).stl` | `part (3).stl` | skip the taken number |
| `part.stl` | `part (1).stl`, `part (3).stl` | `part (2).stl` | gap is filled when starting from 1 |
| `part (3).stl` | `part (1).stl`, `part (2).stl` | `part (4).stl` | do not fill gaps below N+1 |
| `README` | none | `README (1)` | no extension |
| `part.backup.stl` | none | `part.backup (1).stl` | last dot is the extension |
| `v(2).stl` | none | `v(2) (1).stl` | no space before `(` |
| `v(2)` | none | `v(2) (1)` | same rule, no extension |
| `part.STL` | `PART (1).stl` | `part (2).STL` | case-insensitive collision, source extension case kept |
| `part (01).stl` | none | `part (01) (1).stl` | leading zero is not ` (N)` |
| `(1).stl` | none | `(1) (1).stl` | empty base is not stripped |
| `part (0).stl` | none | `part (0) (1).stl` | zero is not ` (N)` |
| `part  (1).stl` | none | `part  (1) (1).stl` | base would end in a space, so do not strip |
| `.gitignore` | none | `.gitignore (1)` | leading dot is not an extension |
| `part (2) (1).stl` | none | `part (2) (2).stl` | only the trailing ` (N)` counts |

Search `n` from the start number through 9999 inclusive. If none are free, return `No free name next to "{file_name}".` Do not fall back to a `-copy` suffix.

**Copy command.** New Tauri command `duplicate_files` in `src-tauri/src/commands/files.rs`, registered in `generate_handler!` in `src-tauri/src/lib.rs` next to `rename_file`. One disk lock for the whole id list, same `block_on_disk` shape as `rename_file`. Emit `LibraryChangeKind::Files` when at least one row was inserted.

```rust
struct DuplicateOutcome {
    ids: Vec<i64>,
    failed: Vec<String>,
    cancelled: bool,
}
```

For each id, in selection order:

1. Load the source row (stored path, folder id, creator, notes, source archive, ext, sha256, thumb status, missing, tag names). A missing id or `missing = 1` appends `That file is missing on disk, so it can't be duplicated.` and continues.
2. Resolve the path with `contained_library_file`. If the file is not on disk, same missing error. Do not create a row.
3. Build `taken` from catalog names in that `folder_id` (`NULL` for the library root) and from names already chosen in this batch for that folder. Case-insensitive.
4. `duplicate_file_name` on the source disk file name.
5. `std::fs::copy` into the same parent directory. Not `hard_link`: a hard link would make a later Recycle Bin delete of one name drop the bytes the other name still needs.
6. Insert a new `files` row. Copy `creator`, `notes`, `source_archive`, `ext`, and `sha256`. `original_name` and `stored_relpath` are the new file name in the same folder. `sort_name` comes from `default_sort_name` of that new name (the same helper `insert_file` uses). `folder_id` is the source folder. `size_bytes` and `mtime` come from the new file's metadata. `imported_at` is now. `missing` is 0.
7. Copy tags with `set_tags` so both `file_tags` and `tags_text` match the source. Tag rows are shared. Do not create new tag names.
8. Thumbnail: if the source `thumb_status` is `ok` and `sha256` is non-empty, the new row is also `ok`. Thumbnails are files named `thumbs/{sha}.png`, so the copy shares that png. `remove_catalogued_file` already deletes the png only when no remaining row has that sha. Otherwise set `none` when `queues_thumbnail(ext)` and `unavailable` when it does not. Never `unhashed`.

**Why the hash is copied.** `sha_exists` makes a normal import skip bytes that are already in the library. The hash pass (`src-tauri/src/hash_pass.rs`, `commit_if_unmoved` then `recycle_duplicate`) sends a row to the Recycle Bin when its bytes match another row and the row is still `unhashed`. An intentional duplicate is the same bytes on purpose. Storing the source sha and a non-`unhashed` thumb status keeps the hash pass from deleting it. Do not change import or the hash pass.

If the copy or the insert fails, delete the new file when it exists and delete the new row when it was inserted. Append `"{file name}: {error}"` to `failed` and continue with the next id. Check the cancel flag between files. Files already copied stay. `cancelled` is true and `ids` holds the new row ids.

**UI.** Label exactly `Duplicate`, placed after `Rename` and before `Set Creator…`.

Use `selectionTarget` so a multi-selection duplicates every selected file, and a click on a file outside the selection duplicates only that file. Each file is copied into its own folder. A library search can show files from more than one folder. Do not drop them all into the folder currently on screen.

`runDiskOp` (`useLibrary.ts`): title `Duplicating "part.stl"...` for one file and `Duplicating 3 files...` for more, `cancellable: true`, success `Duplicated 1 file` or `Duplicated N files`, cancelled `Duplicate cancelled`. `api.duplicateFiles(ids)` invokes `duplicate_files`. On a full failure (`ids` empty and `failed` non-empty), throw so `runDiskOp` shows `setError`. When some copies succeed, `after` selects the new ids, refreshes the list, and `setError`s the joined `failed` lines.

`src/api.ts`:

```ts
duplicateFiles: (ids: number[]) =>
  invoke<{ ids: number[]; failed: string[]; cancelled: boolean }>("duplicate_files", { ids }),
```

Add `duplicateFiles: [[1]]` to `sampleArgs` in `src/api.test.ts`. That test invokes every wrapper and checks `generate_handler!`.

**Files:**

- Modify: `src-tauri/src/names.rs` (`duplicate_file_name` and tests)
- Modify: `src-tauri/src/commands/files.rs` (`duplicate_files` command and work function)
- Modify: `src-tauri/src/lib.rs` (handler list)
- Modify: `src-tauri/src/db/tests_files.rs` (one copy that checks bytes, creator, notes, tags, sha, thumb status, and the next number)
- Modify: `src/api.ts`, `src/api.test.ts`
- Modify: `src/components/dialogs/FileContextMenu.tsx`, `src/components/dialogs/FileContextMenu.test.tsx`
- Modify: `src/components/dialogs/FolderContextMenu.test.tsx` (assert there is no `Duplicate` item)
- Do not modify: `FolderContextMenu.tsx`, `DownloadsContextMenu.tsx`, `unique_file_path`, `hash_pass.rs`

**Interfaces:**

- Consumes: `selectionTarget`, `runDiskOp`, `set_tags`, `contained_library_file`, `default_sort_name`.
- Produces: `pub fn duplicate_file_name(file_name: &str, taken: &[String]) -> Result<String, String>`. Tauri `duplicate_files(ids: Vec<i64>) -> Result<DuplicateOutcome, String>` with camelCase JSON `ids`, `failed`, `cancelled`.

- [ ] **Step 1: Write the failing naming test**

In `src-tauri/src/names.rs` tests:

```rust
#[test]
fn duplicate_file_name_covers_the_numbering_rules() {
    let next = |name: &str, taken: &[&str]| {
        let taken: Vec<String> = taken.iter().map(|item| (*item).to_string()).collect();
        duplicate_file_name(name, &taken).unwrap()
    };
    assert_eq!(next("part.stl", &[]), "part (1).stl");
    assert_eq!(next("part.stl", &["part (1).stl"]), "part (2).stl");
    assert_eq!(next("part (1).stl", &[]), "part (2).stl");
    assert_eq!(next("part (1).stl", &["part (2).stl"]), "part (3).stl");
    assert_eq!(next("part.stl", &["part (1).stl", "part (3).stl"]), "part (2).stl");
    assert_eq!(next("part (3).stl", &["part (1).stl", "part (2).stl"]), "part (4).stl");
    assert_eq!(next("README", &[]), "README (1)");
    assert_eq!(next("part.backup.stl", &[]), "part.backup (1).stl");
    assert_eq!(next("v(2).stl", &[]), "v(2) (1).stl");
    assert_eq!(next("v(2)", &[]), "v(2) (1)");
    assert_eq!(next("part.STL", &["PART (1).stl"]), "part (2).STL");
    assert_eq!(next("part (01).stl", &[]), "part (01) (1).stl");
    assert_eq!(next("(1).stl", &[]), "(1) (1).stl");
    assert_eq!(next("part (0).stl", &[]), "part (0) (1).stl");
    assert_eq!(next("part  (1).stl", &[]), "part  (1) (1).stl");
    assert_eq!(next(".gitignore", &[]), ".gitignore (1)");
    assert_eq!(next("part (2) (1).stl", &[]), "part (2) (2).stl");
    let exhausted: Vec<String> = (1..10_000).map(|n| format!("part ({n}).stl")).collect();
    let err = duplicate_file_name("part.stl", &exhausted).unwrap_err();
    assert!(err.contains("part.stl"), "{err}");
}
```

- [ ] **Step 2: Run the naming test to verify it fails**

```powershell
Set-Location D:\GitHub\3DFileManager\src-tauri
cargo test duplicate_file_name_covers_the_numbering_rules -- --nocapture
```

Expected: FAIL to compile, `duplicate_file_name` is not defined.

- [ ] **Step 3: Implement `duplicate_file_name`**

Only the function described above. Re-run the same `cargo test` command. Expected: PASS.

- [ ] **Step 4: Write the failing menu and catalog tests**

`FileContextMenu.test.tsx`: the item-order test gains `Duplicate` after `Rename`. A new test clicks `Duplicate` with `selected` `[1, 2]` and `fileId` 1 and expects `runDiskOp` to call `api.duplicateFiles([1, 2])`. A click with `fileId` 3 and `selected` `[1, 2]` expects `duplicateFiles([3])`. Mock `../../api` the way the file already mocks `openInProgram`.

`FolderContextMenu.test.tsx`: `screen.queryByRole("menuitem", { name: "Duplicate" })` is null.

`src-tauri/src/db/tests_files.rs`: name the test `duplicate_files_copies_bytes_metadata_and_the_next_free_number` so `cargo test duplicate_files` runs it. Follow `move_files_cancel_keeps_the_rest` for the temp library (`std::env::temp_dir`, then `remove_dir_all`). Insert `part.stl` with creator `Ada`, notes `kept`, sha `sha-part`, tags `FDM` and `Angels`, and `thumb_status` `ok`. Write the bytes `solid part`. Duplicate it. Assert the new path is `part (1).stl`, the bytes match, creator, notes, tags, sha, folder id, and `thumb_status` `ok` match, and `thumb_status` is not `unhashed`. Duplicate the copy and assert `part (2).stl`. A missing id returns an error and does not add a row.

- [ ] **Step 5: Implement the command and the menu**

Work function and `duplicate_files` command as specified. `FileContextMenu` item:

Pull `runDiskOp`, `setSelected`, and `refreshLists` from `app`. The menu item:

```tsx
<button
  type="button"
  role="menuitem"
  onClick={() => {
    const target = selectionTarget(fileMenu.fileId);
    const ids = target.fileIds;
    const title = ids.length === 1 ? `Duplicating "${target.name}"...` : `Duplicating ${ids.length} files...`;
    const success = ids.length === 1 ? "Duplicated 1 file" : `Duplicated ${ids.length} files`;
    setFileMenu(null);
    let created: number[] = [];
    let failures: string[] = [];
    void runDiskOp({
      title,
      cancellable: true,
      success,
      cancelled: "Duplicate cancelled",
      run: async () => {
        const outcome = await api.duplicateFiles(ids);
        created = outcome.ids;
        failures = outcome.failed;
        if (!outcome.cancelled && outcome.ids.length === 0 && outcome.failed.length > 0) {
          throw new Error(outcome.failed.join("\n"));
        }
        return outcome;
      },
      after: async () => {
        if (created.length > 0) setSelected(created);
        await refreshLists();
        if (failures.length > 0) setError(failures.join("\n"));
      },
    });
  }}
>
  Duplicate
</button>
```

- [ ] **Step 6: Run the tests**

```powershell
Set-Location D:\GitHub\3DFileManager\src-tauri
cargo test duplicate_file_name_covers_the_numbering_rules -- --nocapture
cargo test duplicate_files -- --nocapture
Set-Location D:\GitHub\3DFileManager
npm run test:unit -- src/components/dialogs/FileContextMenu.test.tsx src/components/dialogs/FolderContextMenu.test.tsx src/api.test.ts
```

Expected: PASS. Name the catalog test so `cargo test duplicate_files` matches it.

- [ ] **Step 7: Commit**

```powershell
git add src-tauri/src/names.rs src-tauri/src/commands/files.rs src-tauri/src/lib.rs src-tauri/src/db/tests_files.rs src/api.ts src/api.test.ts src/components/dialogs/FileContextMenu.tsx src/components/dialogs/FileContextMenu.test.tsx src/components/dialogs/FolderContextMenu.test.tsx
git commit -m "feat: duplicate library files from the context menu"
```

---

## After these items

- [ ] **Graph coverage**

From `D:\GitHub\3DFileManager`. Do not pipe JSON through PowerShell `>` or `Out-File` (those write UTF-16 and `JSON.parse` rejects it).

```powershell
node .cursor/skills/graph-coverage/scripts/graph-coverage.mjs --summary --changed --out "$env:TEMP\graph-coverage-ui-fixes.json"
```

Static linkage only. On this diff the new symbols are `breadcrumbTitle`, `duplicate_file_name`, and the duplicate command work function. A test that calls each name must leave it off `metrics.untested` with `reachedFromTest: false`. `ImportSummaryDialog`, `Breadcrumb`, `openAddToLibrary`, and `FileContextMenu` should show a `covers` link from their test files. `defaultImportDestination` should be gone, not listed as untested. Re-run the same command after any test added to close a gap. Paste the ratios, the untested rows for touched files, and `blastRadius` into the implementation PR. Also run `cargo test duplicate_file_name -- --nocapture` and `cargo test duplicate_files -- --nocapture` from `src-tauri`.

Then run the whole unit suite so the 80% thresholds in `vitest.config.ts` still pass:

```powershell
npm run test:unit
```

- [ ] **Bugbot**

Run `/review-bugbot` on the implementation PR. Fix findings that are real. Do not expand into recycle behavior or the main-window breadcrumb.

- [ ] **Version bump**

```powershell
npm run version:bump
npm run version:check
```

`version:check` prints the new `YY.MM.N` and exits 0. Commit the files the script changed:

```powershell
git add package.json package-lock.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: bump version"
```

- [ ] **PowerShell UI check (Windows)**

```powershell
Set-Location D:\GitHub\3DFileManager
npm run tauri dev
```

1. Import one supported file. The dialog heading is `Import finished`. The counts line matches the import. The second button's accessible name and visible label are exactly `Move to Recycle Bin`. Click it. The source file leaves the original folder (Recycle Bin). The library copy is still in the library. `Keep originals` on a second import leaves the source file in place.
2. Open Add to library on a file. At `3D Print Library` (or one short folder), Up is on the same row as the breadcrumb, at the trailing end, and the dialog has no horizontal scrollbar.
3. Go to a long folder, for example `3D Print Library > FDM Prints > Toys > Articulated Toys > Dummy 13 > dummy-13`. Up stays on that same row. The breadcrumb shows an ellipsis inside its own area and does not scroll horizontally. Hovering the breadcrumb shows the full ` > ` path. The `Copy into:` line ellipsizes on one line, and its tooltip is the full `Copy into: ...` sentence with ` / ` separators.
4. Narrow the window until the card is at `calc(100% - 32px)`. Up does not wrap. The folder list still scrolls on its own (`.folder-picker-list` is `overflow: auto`, `max-height: 220px`).
5. From Downloads, Add to library on one file. Set the destination to a nested folder, creator to `Maker World`, and tags to `Angels` and `FDM`. Confirm. The import summary still shows that creator and those tags. Close it, return to Downloads, and Add to library on a different file. The destination is the library root only, the creator box is empty, and there are no tag chips and no tag text. Cancel a draft and open the dialog again: those fields are empty again. Select two files and Add to library once: one dialog, one destination, one creator, one tag set.
6. Right-click `part.stl` and choose `Duplicate`. The same folder gains `part (1).stl` with the same creator and tags, and that row stays after the library refreshes. Duplicate `part (1).stl` and get `part (2).stl`. With `part (1).stl` and `part (3).stl` present, duplicating `part.stl` creates `part (2).stl`. Right-click `v(2).stl` and get `v(2) (1).stl`. A folder menu has no `Duplicate`. Two selected files both copy. Right-click a file that is not in the selection and only that file copies.

## Karpathy-style checklist

- Assumptions: the recycle click already does the right disk work; only its label is wrong. The Up wrap is the toolbar flex rules, not missing crumb data. Downloads creator and tags are three `useState` values, and the sticky destination is `defaultImportDestination(history)` after the post-import `setBrowse`. A duplicate must store the source sha and must not be `unhashed`, or the hash pass will recycle it.
- Simple: one string in item 1. CSS plus two tooltip strings in item 2. Three setters and a root `defaultPlace` in item 3. One naming function, one command, and one menu item in item 4. No new component.
- Not in scope: rewriting the question sentence, undoing library copies, changing `trash::delete`, collapsing crumbs with `truncateCrumbs`, restyling the main breadcrumb, touching External Programs Up, clearing creator and tags inside `runDownloadsImport`, splitting a multi-file selection into one dialog per file, duplicating folders or Downloads rows, changing `unique_file_path` or the hash pass.
- Verifiable: the test snippets above, `npm run test:unit` at the 80% thresholds, `cargo test` for the duplicate names and command, graph-coverage on `--changed`, and the six Windows checks.

## Self-review

- Spec coverage: item 1 is the exact label `Move to Recycle Bin`, plus a written account of `recycle_last_import` and the question-sentence mismatch (flagged, not changed). Item 2 is a fixed Up slot, breadcrumb ellipsis with a full-path tooltip, and a Copy into truncation check. Item 3 names the three hook fields and the history default, defines empty creator, empty tags, and library-root destination, and resets on `openAddToLibrary` without clearing `runDownloadsImport`. Item 4 names `FileContextMenu`, the folder and Downloads menus that stay unchanged, `duplicate_file_name`, the copy command, metadata and hash handling, multi-select, errors, and the naming edge cases. Tests, graph-coverage, `/review-bugbot`, Karpathy, `npm run version:bump`, and PowerShell steps are in "After these items".
- No placeholders. Commands and code snippets are in the steps.
- `breadcrumbTitle(crumbs: Crumb[]): string` is the new TypeScript signature, and the tests call that name. Item 3 removes `defaultImportDestination` and adds no replacement export. `duplicate_file_name(file_name: &str, taken: &[String]) -> Result<String, String>` is the new Rust signature, and `duplicate_file_name_covers_the_numbering_rules` calls it.
