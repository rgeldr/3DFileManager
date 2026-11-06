Status: plan only, not started

# Rust test coverage to 80%+ (production code, llvm-cov)

Planning only. No application or test code in this change.

**Prerequisite.** Start implementation **after [PR #60](https://github.com/rgeldr/3DFileManager/pull/60) lands on `main`.** Jason’s llvm-cov numbers and the Windows `cargo test` green run (217 passed) were taken on that branch after the Windows test fixes, `stored_path` / `dunce` path handling, and frontend Vitest ≥80% work. This plan assumes that baseline; rebaseline on `main` post-merge before Phase 1.

**Problem.** Frontend Vitest on PR #60 already meets **≥80% on statements, branches, functions, and lines.** Rust `cargo test` passes on Windows (**217 passed, 0 failed**). Jason ran `cargo llvm-cov --summary-only` on Windows (`file-library` v26.11.5) and got **all-inclusive** totals (test modules compiled into the crate):

| Metric | Jason (all sources) | Gap vs 80% |
|--------|---------------------|------------|
| Regions | **84.45%** (4452 missed / 28630) | Met |
| Lines | **83.25%** (2440 missed / 14565) | Met |
| Functions | **59.95%** (684 missed / 1708) | **~342 functions** |
| Branches | **0%** (not measured) | N/A |

**File-level reality:** `commands/*.rs`, `lib.rs` (`run()`), `main.rs`, and `drag_win.rs` show **0% lines** in the report because **`#[tauri::command]` handlers are never invoked in unit tests**, even when the same behavior is covered via `db/tests_*.rs`, `import/flow_tests_*.rs`, and pure helpers in `commands/tests_*.rs`. **`tests_*.rs` / `flow_tests_*.rs` modules are ~95–100% covered** and **inflate aggregate lines/regions** while **functions stay low** from dozens of unexecuted command entrypoints and Windows COM shims.

The frontend plan (`unit-test-coverage-80.md`, PR #60) targeted Rust **≥75% lines then ≥80%**. On Jason’s all-inclusive run, **lines and regions already exceed 80%**; the remaining work is **production function coverage** (and holding production lines/regions ≥80% once test files are excluded from the gate).

## Assumptions

- **Primary gate (production):** `cargo llvm-cov` with an **ignore regex for test-only paths** (see below). Target **≥80% functions** on production code, while **lines and regions stay ≥80%** (no regression below 80% on those axes).
- **Branch coverage:** **not enabled in Phase 0–4** (Jason’s run shows branches unmeasured). **Default:** add `--branch` only after function/lines gates are stable and Jason confirms the summary is actionable (COM/drag paths may need `--ignore-filename-regex` exceptions). Optional stretch goal: **≥70% branches** on production in a later phase.
- **Platform:** Jason develops on **Windows 11 / PowerShell** with the repo’s MinGW toolchain (README). Unit tests must not assume Unix-only APIs, `/tmp` as the only temp root, or case-sensitive paths. Use existing patterns: `std::env::temp_dir()`, in-memory / temp library roots via `db::open`, `dunce` / canonical paths where PR #60 already fixed `\\?\` behavior.
- **Cloud Agents / Linux CI:** This repo’s Tauri + Windows deps may **not build or test on Linux** (missing `gdk-3.0`, older Cargo vs `edition2024` crates on some VMs). **Jason verifies every Rust change on Windows:** `cargo test`, `cargo llvm-cov --summary-only` with production filter, and graph-coverage JSON. Do not block merge on Linux `cargo test` until a Windows runner exists.
- **Scope:** Behavior-focused unit tests; **no network**; **no writing into real `%APPDATA%`** for debug logs (see `write_debug_log` tests in `commands/tests_open.rs` — use temp / redirected data dir patterns).
- **Workflow per implementation PR:** implement with Composer → **Grok 4.7 (xhigh) review** → run **`.cursor/skills/graph-coverage`** on the diff → **`npm run version:bump`** when the repo’s release practice requires it. **`/review-bugbot`:** not available to Cloud Agents; Jason runs Bugbot manually if enabled.

## What “80%+” means for Rust (this effort)

| Layer | Tool | Gate scope | Target |
|-------|------|------------|--------|
| Production `src-tauri/src` | `cargo llvm-cov` | Files **excluding** test-only names and optional `main.rs` | **Functions ≥80%**, **lines ≥80%**, **regions ≥80%** |
| Test modules | Same run | Listed in HTML for debugging; **excluded from threshold** via `--ignore-filename-regex` | No separate target |
| `main.rs` | — | **Default:** exclude from gate (3-line entry: `file_library_lib::run()`) | Smoke only |
| `lib.rs` `run()` | — | **Default:** do not require 80% on `run()` itself; extract testable setup helpers if needed | Indirect coverage via module tests |

**Why functions lead:** llvm-cov counts **each `#[tauri::command] async fn`**, nested `impl` methods on Windows COM types, and **one-off closures** as separate functions. The DB/import layers already expose **testable public APIs**; the gap is **thin command glue** and **Windows-only drag** not called from tests.

### Production-only estimate (from Jason’s all-inclusive table + repo layout)

**Method:** Treat Jason’s totals as instrumented **test + production**. Approximate test-only contribution using repo line counts on `main` (test-named files `tests_*.rs`, `*_tests_*.rs`, `flow_tests_*.rs`: **~5,337** lines; other production `.rs`: **~12,148** lines). Assume test-only files at **~97% line coverage** (Jason’s per-file band).

| Metric | All-inclusive (Jason) | **Estimated production-only** |
|--------|----------------------|-------------------------------|
| Lines | 83.25% | **~75%** (≈6948 / ≈9228 instrumented prod lines) |
| Functions | 59.95% | **~52%** (≈750 / ≈1428 prod functions after removing ~280 test functions) |
| Regions | 84.45% | **~76–78%** (same inflation effect as lines) |

**Verifiable baseline (Jason, post-#60):** run the PowerShell block in §Jason — production commands; record the three percentages as **R0** and replace the estimates above. Implementation ratchets from **R0**, not from all-inclusive totals.

### llvm-cov: exclude test files from the gate

There is **no** checked-in `.cargo/config` llvm-cov section today. **Default gate flags** (PowerShell, from `src-tauri`):

```powershell
$env:LLVM_COV_FLAGS = '--ignore-filename-regex=(\\tests_|_tests_|flow_tests_)'
cargo llvm-cov --summary-only
```

**Optional additions** (document in Phase 1 PR if used):

```powershell
# Also drop trivial binary entry from gate math:
$env:LLVM_COV_FLAGS = '--ignore-filename-regex=(\\tests_|_tests_|flow_tests_|\\main\.rs$)'
```

**HTML report (debugging uncovered command lines):**

```powershell
cargo llvm-cov --html --open
```

Install once: `cargo install cargo-llvm-cov --locked`.

**Note:** Inline `#[cfg(test)] mod tests { ... }` inside production files still compile during `cargo test` and may appear in reports unless llvm-cov excludes them; prefer **`include!("commands/tests_*.rs")` pattern** (already used) so the regex catches them. New tests should stay in `tests_*.rs` / `flow_tests_*.rs` names.

---

## How the crate is structured today (grounding)

### Command registration

`lib.rs` **`include!`s** command modules and registers **~67** handlers in `tauri::generate_handler![...]`. There is **no** separate `commands/mod.rs`; tests live in `lib.rs`:

```165:175:src-tauri/src/lib.rs
#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::Settings;
    include!("commands/tests_thumbs.rs");
    include!("commands/tests_open.rs");
    include!("commands/tests_files.rs");
    include!("commands/tests_runtime.rs");
    include!("commands/tests_downloads.rs");
    include!("commands/tests_library_events.rs");
}
```

**Not yet included:** dedicated `commands/tests_library.rs`, `tests_settings.rs`, `tests_import_cmd.rs`, `tests_windows.rs` — library/settings/import/window commands rely on **db/import tests only**, hence **0% line coverage on the command files themselves**.

### Thin wrappers vs logic already tested elsewhere

| Module | Role | Logic location | Existing tests |
|--------|------|----------------|----------------|
| `commands/downloads.rs` | 3 commands | `crate::downloads` (**~95% lines**) | `commands/tests_downloads.rs` (partial); **`downloads.rs` domain tests** |
| `commands/import_cmd.rs` | `import_paths`, cancel flags | `import::import_paths`, `summary_for_api` | **`import/flow_tests_*.rs`**, no command wrapper tests |
| `commands/library.rs` | 12 commands | `AppDb` + `off_ui` + `emit_library_changed` | **`db/tests_*`**, **`tests_library_events.rs`**; **no handler tests** |
| `commands/settings.rs` | 11 commands | `Settings` / `db.save_settings` | **`settings.rs` unit tests**; commands **0%** |
| `commands/files.rs` | 21 commands | **`recycle_and_drop_files`**, `block_on_disk`, `db::*` | **`commands/tests_files.rs`** tests **pure helpers**; most commands **0%** |
| `commands/open.rs` | 9 commands | **`read_text_preview`**, drag helpers, `write_debug_log`, launch/reveal | **`commands/tests_open.rs`** (strong on helpers); **Tauri commands 0%** |
| `commands/thumbs.rs` | 6 commands | thumb pipeline + **`requeue_image_thumbs_once`** | **`commands/tests_thumbs.rs`** |
| `commands/runtime.rs` | `off_ui`, disk guard, `data_dir` | same file | **`commands/tests_runtime.rs`** |
| `commands/windows.rs` | `open_new_window` | `crate::windows::open_library_window` | **`windows.rs` tests** (partial) |
| `drag_win.rs` | `start_hdrop`, COM objects | Windows only | **None** (0%) |

**Preferred pattern (same as frontend App extraction):** keep `#[tauri::command]` as **one-line delegates**; move orchestration into **`pub(crate) fn`** or existing modules (`downloads`, `import`, `db`) that tests call **without** `AppHandle`. Where Tauri state is required, use **small “runner” functions** taking `&AppDb` / closures (see `recycle_and_drop_files` in `commands/files.rs`).

### Windows-only code

- **`drag_win.rs` (0%, ~249 lines):** `DoDragDrop`, `IDataObject` / `IDropSource` impls. **Cannot run on Linux agents.**
- **`start_file_drag` in `commands/open.rs`:** calls into `drag_win` on Windows.
- **Testing strategy:** unit-test **pure helpers** (`outcome_from`, `hdrop_bytes` alignment with `drag_out`) on all platforms; **`#[cfg(windows)]` tests** for non-interactive pieces; **no live DoDragDrop** in CI (would block UI thread). Default: accept **COM impl functions** as excluded or covered only by Windows runs Jason executes locally.
- **Paths:** follow PR #60 **`dunce::canonicalize`** / library-root checks in tests; avoid hardcoded `C:\` except where Windows API requires it.

### `lib.rs` and `main.rs`

- **`main.rs`:** trivial entry; **exclude from gate** (default).
- **`lib.rs` `run()`:** Tauri builder, plugins, `setup` closure — **integration territory**. Extract only if a piece is pure (e.g. share **`requeue_image_thumbs_once`** already in `commands/thumbs.rs` and tested). **Do not** spin full Tauri in unit tests for coverage numbers.

---

## Proposed enforcement

### 1. npm script (repo root)

Add in **`package.json`** (implementation Phase 1):

```json
"test:coverage:rust": "cd src-tauri && cargo llvm-cov --summary-only"
```

Document that Jason must set **`LLVM_COV_FLAGS`** in the shell profile or prefix the script on Windows (implementation PR may use `cross-env` or a **`scripts/rust-coverage.ps1`** wrapper — **default:** PowerShell doc + optional `.ps1`).

### 2. Ratchet table (production-only functions primary)

Do **not** jump from **~52% → 80% functions** in one PR.

| Step | When | Production functions | Production lines / regions |
|------|------|----------------------|----------------------------|
| R0 | Post-#60 baseline (Jason) | record actual | record actual |
| R1 | Phase 1 plumbing | **max(R0, 55%)** floor | **≥78%** min |
| R2 | Phase 2 files + library helpers | **+5 pts** | **≥80%** |
| R3 | Phase 3 settings + open + import glue | **+5 pts** | hold |
| R4 | Phase 4 drag_win + windows + schema | **≥80%** | **≥80%** |

Between steps, **raise only one axis per PR** if both would fail.

### 3. CI (future)

Wire **`test:coverage:rust`** on a **Windows runner** with MinGW when available. Until then: **PR template checkbox** — Jason pasted llvm-cov production summary.

---

## Test quality rules

1. **Windows-safe temp dirs:** `std::env::temp_dir().join(format!("filelib-…-{}", std::process::id()))`; clean up in test; never assume `/tmp` only.
2. **No real `%APPDATA%` / `%LOCALAPPDATA%` mutations** for debug log tests — follow **`write_debug_log_appends_under_the_data_dir`** pattern (override via test hooks or test-only `data_dir` if extracted).
3. **Deterministic:** no network; mock external programs via existing **`external_programs`** test env vars where used.
4. **Behavior, not coverage theater:** assert DB/disk outcomes, error strings, cancel flags — not “command invoked” via full Tauri unless a minimal harness is added later.
5. **Platform split:** `#[cfg(windows)]` / `#[cfg(not(windows))]` tests when behavior differs; Linux CI must **`cargo test` compile** non-Windows paths (cfg-gated modules skipped).
6. **Graph coverage:** each implementation PR runs static analysis and closes **`reachedFromTest: false`** on touched symbols:

```powershell
node .cursor/skills/graph-coverage/scripts/graph-coverage.mjs --summary --out $env:TEMP\graph-coverage.json
```

Optionally `--path src-tauri/src/commands/files.rs` for large PRs.

---

## Prioritized work (missed lines × risk)

Order: **high user impact** and **large 0% command surfaces** first, then **Windows drag**, then **schema/migration** function gaps.

### P0 — `commands/files.rs` (~406 lines missed, 11.74%)

- Already has **`recycle_and_drop_files`**, **`ListFilesArgs` parsing** candidates.
- **Extract & test:** argument deserialization / defaults, **`block_on_disk` worker bodies** as `pub(crate) fn` taking `&AppDb` (move/rename/delete/rescan paths), tag/creator listing filters.
- **Risk:** disk jobs + `emit_disk` — inject `impl FnMut(DiskProgress)` like existing delete tests.

### P1 — `commands/library.rs` (242 lines, 0%)

- Commands are **`off_ui` + db + `emit_library_changed`**.
- **Extract:** `library_command` helpers (e.g. `set_library_root_work`, `move_folder_work`) in `db` or new `library_ops.rs`; test with **`AppDb` + temp tree** (patterns in `db/tests_library_move.rs`).
- **`rescan_library` / `rescan_folder`:** delegate to `rescan.rs` (has tests); cover command-layer path validation once extracted.

### P2 — `commands/settings.rs` (~177 lines missed)

- Thin mutators on **`Settings`** — extract **`apply_settings_patch`**-style functions mirroring each command; reuse **`settings.rs`** tests.

### P3 — `commands/open.rs` (~205 lines missed)

- Extend **`tests_open.rs`** upward: **`read_text_preview`**, **`catalog_text_preview`**, drag source collection (already partially tested).
- **`start_file_drag` / `prepare_drag_paths`:** test **non-Windows** stub path and Windows branch with **`#[cfg(windows)]`** mocks where feasible; avoid real **`DoDragDrop`**.

### P4 — `commands/thumbs.rs` (~108 lines missed)

- Build on **`tests_thumbs.rs`**; cover remaining command wrappers around **`next_thumbnail` / save / clear**.

### P5 — `commands/downloads.rs` + `import_cmd.rs` (0% wrappers)

- **`downloads`:** wrap **`set_downloads_folder` / `list_downloads` / `allowed_reveal_target`** — domain already tested; add **`tests_downloads.rs`** cases for command-layer validation if any logic remains in `commands/downloads.rs`.
- **`import_cmd`:** test **`cancel_import` / `cancel_disk_op`** state on **`AppState`** without full import; optional **`import_paths`** orchestration via extracted **`run_import_job`** fn.

### P6 — `drag_win.rs` + `drag_session.rs` + `windows.rs`

- **`outcome_from`**, **`ensure_ole` error path** (unit).
- **`drag_session`:** extend existing tests for native drag session state.
- **`windows::open_library_window`:** test label allocation / anchor offset logic without creating real webview if split out.

### P7 — `import/plan.rs` / `import/store.rs` (mid-high lines, plan 74% / store 84%)

- Extend **`flow_tests_plan.rs` / `flow_tests_store.rs`** for branches Jason’s report still misses.

### P8 — `db/setup.rs` / `db/schema.rs` (lines OK, **schema functions ~25%**)

- **`migrate` / `column_exists`:** add **`db/tests_setup.rs`** cases for each migration step and edge column.

### Skip / exclude

- **`main.rs`:** gate exclude (default).
- **`lib.rs` `run()`:** no direct 80% requirement; optional smoke integration test out of scope for v1.

---

## Phases and PR breakdown

Each row is one mergeable PR. Run **`cargo test`**, production **llvm-cov**, and **graph-coverage** after each. Bump version on user-facing PRs per repo habit.

| Phase | PR | Work | Expected production coverage (approx.) | Success criteria |
|-------|-----|------|----------------------------------------|------------------|
| **0** | **This PR** | Plan only | — | Plan merged after #60 |
| **1** | Rust coverage plumbing | `test:coverage:rust` or `scripts/rust-coverage.ps1`, README, **R1** floor, `LLVM_COV_FLAGS` documented | Baseline **R0** recorded | Jason can reproduce production summary in one command |
| **2** | Files command extraction A | P0: move/delete/recycle/list arg helpers + tests | Functions **+3–5 pts**, lines **≥80%** | No behavior change; graph gaps closed |
| **3** | Library + settings glue | P1–P2 extractions + `tests_library` / settings command tests | Functions **~65–70%** | `set_library_root` / folder ops covered at helper layer |
| **4** | Open + thumbs + downloads/import wrappers | P3–P5 | Functions **~72–76%** | Drag/open paths tested where pure |
| **5** | Windows drag + windows + import/db gaps | P6–P8 | Functions **≥80%**, lines/regions **≥80%** | Jason confirms on Windows; **`#[cfg(windows)]` tests green |
| **6** (opt.) | Branch coverage | `--branch` + tune ignores | Branch baseline | Only if Jason wants a second gate |

**Final success criteria (verifiable):**

- Post-#60 Windows: **`cargo test`** → **0 failed** (217+ tests).
- **`LLVM_COV_FLAGS` production regex** + **`cargo llvm-cov --summary-only`** → **functions, lines, regions each ≥80%**.
- All-inclusive totals may still be quoted for comparison but **do not gate merge**.
- Graph coverage: no new **`reachedFromTest: false`** on touched production symbols; direct node coverage on changed Rust **≥ prior PR**.
- Three consecutive Windows runs without flaky tests.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Over-mocking Tauri / `AppHandle` | Prefer **`AppDb`-only helpers**; one thin integration test optional later |
| Changing command behavior while extracting | Extract-only PRs; parity tests before/after |
| **`drag_win` untestable on Linux** | `#[cfg(windows)]` tests; Jason runs full suite; document Linux compile-only |
| Debug log tests touching real app data dir | Centralize **`data_dir()`** injection or test subdir (existing tests_open pattern) |
| llvm-cov regex hides real gaps | Keep HTML report; review **`commands/*.rs`** line view each phase |
| Function metric noisy (async/command count) | Ratchet gradually; accept **`main.rs` exclude** |
| Cloud Agent cannot run `cargo test` | Jason verification required in PR checklist |

---

## Open questions (defaults)

| Question | Default |
|----------|---------|
| Gate on all-inclusive or production-only? | **Production-only** via `--ignore-filename-regex` |
| Require 80% on each `commands/*.rs` file? | **No** — global production metrics; file view for review |
| Enable branch coverage now? | **No** until functions ≥80% |
| Test full Tauri `App` for coverage? | **No** — extract helpers |
| Exclude `drag_win` COM impls from gate? | **No** — cover pure helpers; COM via Windows-only tests where possible |
| CI enforcement? | **Document first**; Windows runner later |
| Bugbot | Manual on Jason’s side |

---

## Jason — PowerShell commands (measure production Rust coverage)

From repo root, **after PR #60 is on `main`:**

```powershell
npm ci   # if frontend lockfile changed with #60

Set-Location src-tauri
cargo test
# Production-only gate (record as R0 before Phase 1):
$env:LLVM_COV_FLAGS = '--ignore-filename-regex=(\\tests_|_tests_|flow_tests_)'
cargo llvm-cov --summary-only

# Optional: exclude main.rs from gate math
$env:LLVM_COV_FLAGS = '--ignore-filename-regex=(\\tests_|_tests_|flow_tests_|\\main\.rs$)'
cargo llvm-cov --summary-only

# HTML detail (command files at 0% vs helpers in db/import)
cargo llvm-cov --html --open

Set-Location ..

# Static graph (UTF-8 file — do not use default Out-File for JSON consumers)
node .cursor/skills/graph-coverage/scripts/graph-coverage.mjs --summary --out $env:TEMP\graph-coverage.json
node .cursor/skills/graph-coverage/scripts/graph-coverage.mjs --summary --path src-tauri/src/commands --out $env:TEMP\graph-coverage-commands.json
```

After Phase 1:

```powershell
npm run test:coverage:rust   # when script lands; set LLVM_COV_FLAGS in profile or wrapper
```

Compare with frontend (already ≥80% on PR #60):

```powershell
npm run test:coverage   # or test:unit per #60
```

---

## Karpathy-style checklist

- **Assumptions stated:** post-#60 baseline, production-only llvm-cov regex, Windows verification, function-first gate, no full Tauri spin-up.
- **Simple:** extract command bodies to **`AppDb`-level helpers** already used by `db/tests_*` / `flow_tests_*`; ratchet thresholds.
- **Verifiable:** R0/R1–R4 table, PowerShell commands, numeric success criteria, graph-coverage path.
