---
name: graph-coverage
description: >-
  Runs static graph coverage analysis (node coverage, edge coverage, def-use,
  blast radius, high-risk path prioritization) over TypeScript and Rust sources.
  Use when the user asks for graph coverage, blast radius analysis, node or edge
  coverage, def-use coverage, hotspot review, or structural coverage before code review.
---

# Graph coverage

## Core Graph Principles

• Nodes: Represent discrete code elements like statements, basic blocks, functions, classes, or modules.
• Edges: Represent relationships such as control flow jumps, method calls, inheritance, data variable definitions/uses, or test coverage.
• Blast Radius Analysis: Tracing how many downstream nodes, callers, APIs, or tests are impacted by a change to a single node.

## Structural & Flow Coverage Criteria

During code review and software testing, coverage ensures your review or test path touches the right structural paths:
• Node Coverage (NC): Ensures the review or test path visits all reachable statements or basic blocks.
• Edge Coverage (EC): Ensures all control-flow branches (e.g., true/false outcomes of if statements or loop conditions) are evaluated.
• Data Flow / Def-Use Coverage: Tracks where variables are defined (def) and where they are subsequently referenced (use), ensuring mutations or state changes don’t create silent bugs.
• High-Risk Path Prioritization: Instead of reviewing file-by-file, reviewers start at high-connectivity nodes (hotspots) or paths with low test coverage.

## Run analysis

From the repository root:

```bash
node .cursor/skills/graph-coverage/scripts/graph-coverage.mjs --summary --out "$TEMP/graph-coverage.json"
```

Optional flags:

- `--summary` — omit the raw `nodes` and `edges` arrays (several MB). Use this unless you need to trace individual edges.
- `--out <file>` — write UTF-8 JSON to a file. Use this on Windows: PowerShell `>` redirection writes UTF-16, which `JSON.parse` rejects.
- `--changed` — compute blast radius for symbols touched by `git diff` (staged + unstaged). Used by default when a diff exists.
- `--symbol Name` — blast radius for one function, method, class, or struct.
- `--path <file-or-dir>` — restrict analysis to that path under `src/` or `src-tauri/src/`.

Without `--out`, the script prints one JSON object to stdout. Do not commit that output.

**What counts as test code (excluded from the graph, used only as `covers` sources):**

- TypeScript: `src/**/*.test.ts(x)` / `*.spec.ts(x)` and `scripts/*.test.mjs`. Type-only imports and module path strings are ignored, so `import type { X } from "../hooks/useLibrary"` does not cover `useLibrary`.
- Rust: each `#[test]` / `#[tokio::test]` function body, files named `tests_*.rs` / `*_tests_*.rs` (pulled in via `include!`), and any item gated by `#[cfg(test)]` (inline `mod tests`, test-only helpers).

**Coverage caveat:** `covers` edges link tests to code by static name mention. This is not executed line or branch coverage, and common names (`new`, `open`, `get`) can over-link. State that clearly in every report. For executed TypeScript line coverage, run `npm run test:unit` (Vitest v8; its `coverage.include` list in `vitest.config.ts` is narrower than `src/`).

## Interpret JSON

| Field | Meaning |
|-------|---------|
| `nodes` | `{ id, kind, name, file, line, exported?, tauriCommand? }` (omitted with `--summary`) |
| `edges` | `{ from, to, kind }` where `kind` is `cfg`, `call`, `inherits`, `def-use`, or `covers` (omitted with `--summary`) |
| `metrics.nodeCoverage` | named symbols (function, method, class, struct, enum, trait) with a direct `covers` edge; `transitive*` also counts symbols reachable by `call` edges from a covered symbol |
| `metrics.edgeCoverage` | ratio of `cfg` edges in test-linked functions |
| `metrics.defUse` | pairs, unused defs, ambiguous uses |
| `metrics.hotspots` | top 25 nodes sorted by in-degree + out-degree |
| `metrics.untested` | every symbol with no direct `covers` edge, sorted by degree; `reachedFromTest: false` means no test reaches it even indirectly, so treat those as the real gaps |
| `blastRadius` | per seed: downstream callees, upstream callers, public APIs, linked tests |

## Report template

Produce this in chat (no app code edits):

```markdown
# Graph coverage report

## Scope
- Paths analyzed: …
- Static test linkage only (not executed coverage).

## Coverage
| Criterion | Covered | Total | Ratio |
|-----------|---------|-------|-------|
| Node (NC), direct | … | … | …% |
| Node (NC), transitive | … | … | …% |
| Edge (EC) | … | … | …% |
| Def-use pairs | … | … | — |

## Untested gaps
(Group `metrics.untested` entries with `reachedFromTest: false` by file; call out Tauri commands and exported APIs.)

## Blast radius
(For `--changed`, `--symbol`, or full graph seeds.)

## Review order (high-risk paths)
1. [file:line] `symbol` — reason (hotspot / low coverage / in blast radius)
…
```

Prioritize hotspots with low `covers` linkage and nodes in the blast radius of the current change.

## Gap-closing plan (when asked)

If the user asks for a plan to close coverage gaps, write it to `.cursor/plans/<topic>.plan.md` following the existing plan files there. Group work by layer (Rust commands, Rust core, TS lib, hooks, components), name concrete test files to add or extend, and give a verify step per item (`cargo test`, `npm run test:unit`, re-run this script).
