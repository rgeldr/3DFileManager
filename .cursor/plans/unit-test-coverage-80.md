Status: plan only, not started

# Unit test coverage to 80%+ (frontend Vitest + Rust backend)

Planning only. No application or test code in this change.

**Problem.** Jason’s latest frontend run (`npm run test:unit`, Vitest 5 + v8, 92 files, 472 tests) reports aggregate **statements 80.13%** (passes 80) but **branches 74.45%** and **functions 75.06%** (both below 80). **Lines 83.24%** already pass. The `src/` folder rollup is **56.66% statements** because **`App.tsx` dominates** (~700 lines, ~26% statements, ~8.75% functions). Hooks (**55.93% functions**), workers (**52%**), **`Viewer.tsx`**, **`renderThumb.ts`**, and several dialogs drag branch and function metrics down. **`src/types.ts`** and **`src/components/dialogs/index.ts`** are type/re-export barrels (0% in v8 reports; should not drive enforcement). The Rust backend (`src-tauri`, `cargo test`) has **no published line/branch coverage number** in CI today; many commands already have `tests_*.rs` modules, but static graph coverage still lists **48 symbols with no direct test linkage**, including several Tauri commands.

## Assumptions

- **Primary gate:** Vitest v8 **global** thresholds on `coverage.include` in `vitest.config.ts` (`src/**/*.{ts,tsx}` minus tests, `main.tsx`). Target **≥80%** on **statements, branches, functions, and lines** together—not statements alone.
- **Secondary gate:** Rust **`cargo llvm-cov`** (or tarpaulin) on Jason’s Windows/MinGW dev machine and in CI when the toolchain matches the repo (see measurement below). Target **≥75% line coverage** in phase 1, **≥80%** once baseline is known (default if Jason does not specify otherwise).
- **Platform:** Jason develops on **Windows 11 / PowerShell**. Unit tests must not assume Unix paths, `/tmp`, or case-sensitive paths. Use patterns already in the repo (`path.join`, mocked Tauri APIs, temp dirs via Rust `tempfile` in backend tests).
- **Scope of “unit”:** jsdom + mocked `@tauri-apps/*` and workers where needed; no real network, no full Three.js GPU, no real OS drag-out. Behavior-focused tests; not screenshot snapshots of the whole UI.
- **Enforcement rollout:** CI must not flip from 0% enforcement to 80% on all axes in one commit if that blocks `main`. **Ratchet in steps** (documented in Phase 0–1).
- **Workflow per implementation PR:** implement with Composer → **Grok 4.7 (xhigh) review** → run **`.cursor/skills/graph-coverage`** on the diff and close static gaps it flags → **`npm run version:bump`** when the repo’s release practice requires it (same sync as `package.json`, `tauri.conf.json`, `Cargo.toml`). **`/review-bugbot`:** not available to Cloud Agents in this environment; Jason can run Bugbot manually on each PR if enabled on the repo.

## What “80%+” means here (measured baseline)

### Vitest (this VM, 2026-11-04, after `npm ci`, `npm run test:unit`)

| Metric | All files | Gap to 80% |
|--------|-----------|------------|
| Statements | **80.13%** (3449/4304) | Met |
| Branches | **74.45%** (1889/2537) | **~139 branches** |
| Functions | **75.06%** (870/1159) | **~57 functions** |
| Lines | **83.24%** (3051/3665) | Met |

**Interpretation:** “80%+” for the frontend means lifting **branches and functions** to 80 while holding statements/lines. Statements already pass only because **`src/lib/**` is ~93%** and offsets **`App.tsx`**.

**Worst executed-coverage files (statements / branches / functions)—aligns with Jason’s run:**

| Area | File | Stmts / Branch / Func | Notes |
|------|------|------------------------|-------|
| Shell | `src/App.tsx` | 26 / 40 / **9** | Uncovered bands include ~315–544, 568–622, 652–687+; menu handlers, disk ops, dialog wiring, imports |
| 3D | `src/components/Viewer.tsx` | 47 / 57 / 64 | WebGL/Three paths; partial tests exist |
| Hooks | `src/hooks/useLibraryChanged.ts` | 46 / 37 / 64 | Event listener + refresh paths |
| Hooks | `src/hooks/useSessionEffects.ts` | 60 / 45 / 46 | Session/settings/browse side effects |
| Hooks | `src/hooks/useLibrary.ts` | 75 / 65 / **33** | Many callbacks inside one hook |
| Hooks | `src/hooks/useAppUpdate.ts` | 69 / 71 / 60 | Updater banner/install |
| Lib | `src/lib/libraryChanged.ts` | 67 / 42 | Tauri event bridge |
| Lib | `src/lib/renderThumb.ts` | 68 / 48 / 74 | Canvas + mesh thumb pipeline |
| Worker | `src/workers/meshParse.worker.ts` | 52 / 39 / 65 | Parser branches |
| Dialogs | `ImportSummaryDialog.tsx` | 40 / 40 / 50 | |
| Dialogs | `CreatorDialog`, `FolderTagDialog`, `DownloadsContextMenu`, `AboutDialog`, `DragFailureDialog`, `TagColorDialog`, `MissingFilesDialog` | various | Mostly interaction branches |
| UI | `Sidebar.tsx`, `Inspector.tsx`, `LibrarySearch.tsx`, `DownloadsInspector.tsx` | func gaps | Handler props not exercised |

**Excluded from enforcement (keep out of threshold math, still listed in HTML report optional):**

- `src/main.tsx` (already excluded)
- `src/types.ts` — types only
- `src/components/dialogs/index.ts` — re-exports only
- Any future `**/*.d.ts`

### Static graph coverage (not executed; `graph-coverage.mjs --summary`, same date)

| Metric | Ratio |
|--------|-------|
| Direct node (symbol) coverage | **94.1%** (767/815) |
| Transitive node | **95.2%** |
| Edge (cfg) | **88.3%** (5920/6704) |
| Symbols with no test reach | **48** (e.g. `start_file_drag`, `rescan_folder`, `set_grid_size`, drag_win handlers) |

Use graph coverage **per PR** to catch “test mentions symbol but never executes branch” and to prioritize Rust commands with zero `covers` edge.

### Rust executed coverage (this VM)

**Unmeasurable here.** `cargo test` in `src-tauri` fails dependency resolution: crates require **`edition2024`**, but the VM Cargo is **1.83.0**. `cargo-llvm-cov` was installed but cannot run until the project builds.

**Jason / CI default procedure (Windows, project MinGW per README):**

```powershell
cd src-tauri
cargo test
cargo llvm-cov --summary-only
# HTML: cargo llvm-cov --html --open
```

If `llvm-cov` is not installed: `cargo install cargo-llvm-cov --locked` (once per machine). Record the summary in the Phase 0 PR description and set the Rust ratchet from that baseline.

**Per-layer targets (once measurable):**

| Layer | Tool | Phase A target | Final target |
|-------|------|----------------|--------------|
| Frontend `src/` | Vitest v8 | Match current aggregate, then +2% branches/funcs per PR | **80/80/80/80** global |
| Rust `src-tauri/src` | llvm-cov lines | Baseline + 5 pts | **≥80% lines** on library code (exclude `main.rs` smoke if needed) |

---

## Proposed enforcement (`vitest.config.ts` + scripts)

### 1. `test:coverage` script (`package.json`)

Add a dedicated script (implementation PR 1):

```json
"test:coverage": "vitest run --coverage"
```

Keep **`test:unit`** as-is today (already runs coverage) **or** make `test:unit` run tests without coverage and `test:coverage` the CI gate—**default decision:** keep `test:unit` unchanged for local speed; **`test:coverage` is the CI/check script** that applies thresholds (duplicate command, explicit name for Jason and CI).

### 2. Global thresholds (ratchet)

In `vitest.config.ts` under `test.coverage`:

```ts
thresholds: {
  statements: 80,
  branches: 80,
  functions: 80,
  lines: 80,
},
```

**Rollout (so CI does not break on day one):**

| Step | When | thresholds (stmts / branch / func / lines) |
|------|------|---------------------------------------------|
| R0 | Plan only | none |
| R1 | PR 1 “coverage gate plumbing” | **80 / 74 / 75 / 83** (current measured floors) |
| R2 | After App + hooks PRs land | **80 / 77 / 78 / 83** |
| R3 | After worker/viewer/dialog PRs | **80 / 79 / 79 / 83** |
| R4 | Final polish PR | **80 / 80 / 80 / 80** |

Between R1 and R4, **raise only one axis per PR** if a single PR would otherwise fail—prefer branches first, then functions.

### 3. Per-file / new-code floors

Vitest supports path-specific thresholds. **Default policy:**

- **Existing hotspots** (`App.tsx`, `useLibrary.ts`, `useSessionEffects.ts`, `Viewer.tsx`, `meshParse.worker.ts`): no per-file 80% until after extraction PRs; until then global ratchet carries them.
- **New files and files touched for coverage** in a PR: **≥80% on all four metrics** for that file, enforced in review + optional glob:

```ts
thresholds: {
  // ... global ...
  "src/lib/**": { statements: 85, branches: 80, functions: 80, lines: 85 },
  "src/hooks/**": { statements: 80, branches: 78, functions: 78, lines: 80 },
},
```

Adjust globs upward as phases complete. **Do not** add thresholds for `types.ts` or `dialogs/index.ts`; add to `coverage.exclude`:

```ts
exclude: [
  "src/**/*.test.{ts,tsx}",
  "src/**/*.d.ts",
  "src/main.tsx",
  "src/types.ts",
  "src/**/index.ts", // barrel re-exports only — verify no file with runtime logic is named index.ts
],
```

**Risk:** `src/**/index.ts` might hide a future module with logic—**open question default:** exclude only `src/components/dialogs/index.ts` explicitly until another barrel appears.

### 4. CI hook (future)

When CI runs frontend tests, call **`npm run test:coverage`** not bare `vitest run`. Document in README/wiki if missing.

---

## Test quality rules

1. **Windows-safe:** no hard-coded `/` paths in assertions; use `import.meta.url`, `path` from node where scripts apply, or string literals matching repo conventions (`\\` in Rust tests only when testing Windows APIs).
2. **No snapshot spam:** avoid full-component snapshots; prefer role/text queries and explicit expectations on handler calls (`vi.fn()`).
3. **Test behavior, not implementation:** assert user-visible outcomes and mocked `api.*` / event emissions, not private hook innards unless extracting pure helpers.
4. **Determinism:** `vi.useFakeTimers()` for debounce, auto-expand 500ms, thumb pump, update polling; always restore timers.
5. **No network:** mock fetch/Tauri/updater; worker tests use inline worker or `meshParse.worker.test.ts` patterns already in repo.
6. **Graph coverage:** each implementation PR runs `node .cursor/skills/graph-coverage/scripts/graph-coverage.mjs --summary --out $env:TEMP\graph-coverage.json` (PowerShell) or `$TEMP/graph-coverage.json` (bash) and mentions untested symbols touched by the diff in the PR body.

---

## Prioritized work (risk × size)

Order is **blast radius first**, then **cheap branch wins**, then **heavy 3D/worker**.

### P0 — `App.tsx` (largest gap; surgical testability)

**Do not** only add a monolithic `App.test.tsx` that mocks every child—existing tests already mock heavily and still leave **~91% of AppShell functions** uncovered.

**Proposed extractions (behavior-preserving, small PRs):**

| Extract | Suggested module | Unit-test focus |
|---------|------------------|-----------------|
| Menu / File+View commands | `src/lib/appMenuActions.ts` or `useAppMenuHandlers.ts` | `rescanLibrary`, backup/import prompts, `setLibraryRoot`, external programs open—pure async with injected `api` |
| Disk job wrapper | extend `src/lib/libraryJobBusy.ts` | `runDiskOp` success/cancel/error toasts |
| Dialog open/close state machine | `src/lib/appDialogState.ts` | reducer or small functions for which modal is open |
| Import summary / missing files flows | colocate with existing dialog tests | trigger from extracted handlers |

Keep **`AppShell`** as composition: hooks + JSX. Target after Phase 2: **`App.tsx` ≥60% stmts, ≥50% funcs** (realistic intermediate), **≥75%** after Phase 3 integration tests—not necessarily 80% on the file if handlers live in tested modules (global metrics still must hit 80).

**Tests:** extend `App.test.tsx` only for wiring smoke (one menu path, one dialog open); bulk coverage on extracted modules.

### P1 — Hooks (function coverage)

| Hook | Approach |
|------|----------|
| `useLibrary.ts` | Export testable **callback factories** or move `useCallback` bodies to `lib/libraryActions.ts`; test with `@testing-library/react` + mocked `api` (pattern in `useLibrary.test.tsx`) |
| `useSessionEffects.ts` | Split effect blocks by concern (settings persist, browse sync, selection); test each with fake timers and mocked listeners |
| `useLibraryChanged.ts` + `lib/libraryChanged.ts` | Mock `listen` from Tauri; assert debounced reload / `setFolders` |
| `useAppUpdate.ts` | Already partially tested; cover install path, error banner, `about` busy |

### P2 — Worker + `renderThumb.ts`

| Piece | Realistic in jsdom |
|-------|---------------------|
| `meshParse.worker.ts` | Keep **`meshParse.worker.test.ts`**; add cases for error branches, unsupported format, large buffer guard—worker runs in test harness |
| `renderThumb.ts` | Mock `HTMLCanvasElement.getContext` (jsdom logs “Not implemented” today); assert **calls and early returns**, not pixel output; optional **`canvas` npm** devDependency only if mocks become unmaintainable (**default: no new dep**) |
| `meshParseClient.ts` | Already ~94%; align worker/client tests |

### P3 — `Viewer.tsx`

- Mock `THREE.WebGLRenderer`, `requestAnimationFrame`, resize observer.
- Test: file too large message, unsupported extension, cleanup on unmount, material path toggles—**not** full orbit controls.

### P4 — Dialogs (branch-heavy, small files)

Extend existing `*.test.tsx` per dialog:

- **ImportSummaryDialog** — confirm/dismiss, list actions, empty state
- **CreatorDialog / FolderTagDialog / TagColorDialog** — validation branches, cancel vs save
- **DownloadsContextMenu** — each menu item invokes callback
- **AboutDialog** — update check buttons (mock `useAppUpdate`)
- **DragFailureDialog / MissingFilesDialog** — confirm paths

### P5 — Components (function gaps)

- **Sidebar** — folder drop highlight, pin, context menu callbacks (extend `Sidebar.test.tsx`)
- **Inspector** — tag/creator editors, pin (extend `Inspector.test.tsx`)
- **LibrarySearch / DownloadsInspector** — exercise scope toggle and sort handlers

### P6 — Rust (thin command tests)

Prioritize symbols **unreached in graph** and **user-facing commands**:

- `commands/open.rs` — `reveal_folder`, `start_file_drag` (mock paths)
- `commands/library.rs` — `rescan_folder`
- `commands/settings.rs` — `set_grid_size`, `set_search_scope`
- `commands/files.rs` — `list_tag_counts`, `list_type_counts`
- `drag_win.rs` — unit-test pure helpers where possible; integration behind `#[cfg(test)]` with fakes

Follow existing `commands/tests_*.rs` + `db/tests_*.rs` patterns (in-memory DB, tempfile library root).

---

## Vitest performance (optional PR, low risk)

Jason’s run: **jsdom created 92 times**, ~48s environment time (207s on his machine). Vitest suggests **`pool: 'vmThreads'`** with per-file isolation **or** `isolate: false`.

**Suggested experiment (separate PR, not blocking 80%):**

```ts
test: {
  pool: "vmThreads",
  // or: isolate: false after verifying no shared global leaks
}
```

**Verify:** full `npm run test:coverage` twice; watch for order-dependent failures in `useFileDrag.test.ts`, worker tests, and anything mutating `window`. **Default:** merge only if 472 tests stay green with no new flakiness.

---

## Phases and PR breakdown

Each row is one mergeable PR. Run graph-coverage + Vitest after each. Bump version on user-facing PRs per repo habit.

| Phase | PR | Work | Expected Vitest (global approx.) | Success criteria |
|-------|-----|------|----------------------------------|------------------|
| **0** | **This PR** | Plan only | — | Plan merged |
| **1** | Coverage plumbing | `test:coverage`, thresholds **R1**, exclude types/barrels, README PowerShell one-liner | Same metrics, CI fails if regression below floor | Thresholds match table R1 |
| **2** | App extraction A | Menu + disk op handlers → lib/hook + tests | Stmts ~81%, funcs ~76% | New modules ≥80%; `App.tsx` stmts +15 pts |
| **3** | App extraction B | Dialog/import/missing flows + wiring tests | Funcs ~78% | Critical menu paths tested via mocks |
| **4** | Hooks | `useLibrary` / `useSessionEffects` / `useLibraryChanged` / `useAppUpdate` | Branches ~77%, funcs ~80% | Hook func coverage ≥70% each |
| **5** | Worker + renderThumb | Branch coverage in parser + thumb early exits | Branches ~79% | Worker stmts ≥70% |
| **6** | Viewer + dialogs | Viewer mocks + dialog branch tests | Branches ~80%, funcs ~80% | Listed dialogs ≥75% each |
| **7** | UI func gaps | Sidebar, Inspector, LibrarySearch, DownloadsInspector | All four metrics ≥80% | `npm run test:coverage` passes **R4** |
| **8** | Rust coverage | Command tests + llvm-cov doc in PR | Rust lines ≥ target | `cargo test` + llvm-cov summary in PR |
| **9** (opt.) | Vitest pool | perf-only | unchanged coverage | ≥20% faster env time locally |

**Final success criteria (verifiable):**

- `npm run test:coverage` → **statements, branches, functions, lines ≥ 80%** (thresholds R4).
- `cargo test` passes on Windows; **`cargo llvm-cov --summary-only`** lines **≥ 80%** (or documented exception list).
- Graph coverage: no new **`reachedFromTest: false`** symbols in touched files; direct node coverage on changed Rust/TS **≥ prior PR**.
- No flaky tests over 3 consecutive CI runs.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Flaky timers / listeners | Fake timers; `cleanup()` in RTL; unlisten mocks |
| Over-mocking hides regressions | One integration-style test per extracted flow; graph-coverage for linkage |
| Refactors change behavior | Extract-only first PR in a phase; no UX changes mixed with coverage |
| `App.tsx` never hits 80% file-local | Accept if extracted modules covered; watch **global** metrics |
| jsdom canvas/WebGL | Mock; do not chase pixel-perfect thumb tests |
| Rust coverage tool variance | Standardize on **llvm-cov**; same flags in CI |
| Threshold ratchet blocks merge | Raise floors only when PR branch proves green |

---

## Open questions (defaults)

| Question | Default |
|----------|---------|
| Split `test:unit` vs coverage? | Keep both; CI uses `test:coverage` |
| Exclude all `index.ts` barrels? | Exclude only `dialogs/index.ts` until others appear |
| Require 80% on `App.tsx` file? | No—global 80%; file intermediate 60→75 |
| Add `canvas` npm for thumbs? | No—mock getContext |
| Rust coverage in CI now? | Document locally in PR 8; wire CI when MinGW runner stable |
| Bugbot | Manual on Jason’s side; not in Cloud Agent |

---

## Jason — PowerShell commands (measure coverage)

From repo root:

```powershell
npm ci
npm run test:unit          # tests + v8 report (today)
npm run test:coverage      # after Phase 1 — gated run

# Graph coverage (static; use file redirect — not Out-File default UTF-16 for JSON consumers)
node .cursor/skills/graph-coverage/scripts/graph-coverage.mjs --summary --out $env:TEMP\graph-coverage.json

# Rust (MinGW / project env per README)
Set-Location src-tauri
cargo test
cargo llvm-cov --summary-only
Set-Location ..
```

Open HTML Vitest report: `coverage/index.html` under project root after a coverage run.

---

## Karpathy-style checklist

- **Assumptions stated:** global four-metric 80%, Rust measured separately, Windows-first, ratchet thresholds.
- **Simple:** extract handlers from `App.tsx` instead of mega-render tests; exclude pure type barrels.
- **Verifiable:** numeric thresholds R1→R4; commands above; graph-coverage JSON path; success criteria table.
