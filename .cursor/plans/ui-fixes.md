Status: plan only, not started

# UI fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Import finished recycle button label, and keep the Add to library Up button in one place when the folder path is long.

**Architecture:** Item 1 is a string change in `ImportSummaryDialog`. The click handler, `recycle_last_import`, and the question sentence stay as they are. Item 2 is picker-only CSS plus a tooltip string. The main-window breadcrumb and the External Programs Up button stay as they are. Later notes from Jason append as the next number. Do not renumber.

**Tech Stack:** React 19, Vitest 5 + v8 (`npm run test:unit`), plain CSS in `src/styles/dialogs.css`. No Rust change for these two items.

## Global Constraints

- Planning file only until Jason sets an item to in progress. This document does not change product code and does not bump the version.
- Jason develops on Windows 11, PowerShell, repo `D:\GitHub\3DFileManager`. Tests must not assume Unix paths, `/tmp` as a real directory, or a case-sensitive filesystem. Use `node:path` (`join`, `dirname`) and `fileURLToPath` when a test reads a file.
- Unit tests for every new and changed function, with the existing Vitest gate in `vitest.config.ts`: statements, branches, functions, and lines all ≥ 80. `npm run test:unit` is the executed-coverage command.
- After the implementation diff exists, run `.cursor/skills/graph-coverage` (static name linkage, not executed coverage), add tests for gaps in the new and changed symbols, and run it again. `covers` edges match names in test source. They are not line or branch coverage. Names like `open` can over-link.
- After implementation, run `/review-bugbot` on that PR and address findings before merge. This plan PR is not that review.
- Karpathy: minimal focused diffs. No new component, no recycle-behavior change, no hand-edited version fields, no drive-by refactors.
- Version changes happen only through `npm run version:bump` (`scripts/version.mjs`), which writes `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `src-tauri/Cargo.lock` together. One bump per implementation PR, after tests pass. Do not edit those version fields by hand.
- Items 1 and 2 are independent. One commit per item, one implementation PR, unless a later item is large enough to split.

## How to add the next item

Append `### N. Short name` with N = one more than the last item. Do not reuse or reorder numbers. Each item needs: what Jason saw, exact components / strings / CSS, the code change, tests, and a PowerShell check. Set that item's status to `not started` until implementation begins.

---

### 1. Import finished — recycle button label

**Status:** not started

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

**Status:** not started

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

## After both items

- [ ] **Graph coverage**

From `D:\GitHub\3DFileManager`. Do not pipe JSON through PowerShell `>` or `Out-File` (those write UTF-16 and `JSON.parse` rejects it).

```powershell
node .cursor/skills/graph-coverage/scripts/graph-coverage.mjs --summary --changed --out "$env:TEMP\graph-coverage-ui-fixes.json"
```

Static linkage only. On this diff the new symbol is `breadcrumbTitle`. A test that calls it must leave it off `metrics.untested` with `reachedFromTest: false`. `ImportSummaryDialog` and `Breadcrumb` should show a `covers` link from their test files. Re-run the same command after any test added to close a gap. Paste the ratios, the untested rows for touched files, and `blastRadius` into the implementation PR.

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

## Karpathy-style checklist

- Assumptions: the recycle click already does the right disk work; only its label is wrong. The Up wrap is the toolbar flex rules, not missing crumb data.
- Simple: one string in item 1. CSS plus two tooltip strings in item 2. No new component.
- Not in scope: rewriting the question sentence, undoing library copies, changing `trash::delete`, collapsing crumbs with `truncateCrumbs`, restyling the main breadcrumb, touching External Programs Up.
- Verifiable: the test snippets above, `npm run test:unit` at the 80% thresholds, graph-coverage on `--changed`, and the four Windows checks.

## Self-review

- Spec coverage: item 1 is the exact label `Move to Recycle Bin`, plus a written account of `recycle_last_import` and the question-sentence mismatch (flagged, not "fixed"). Item 2 is a fixed Up slot, breadcrumb ellipsis with a full-path tooltip, and a Copy into truncation check. Tests, graph-coverage, `/review-bugbot`, Karpathy, `npm run version:bump`, and PowerShell steps are in "After both items".
- No placeholders. Commands and code snippets are in the steps.
- `breadcrumbTitle(crumbs: Crumb[]): string` is the only new signature, and the tests call that name.
