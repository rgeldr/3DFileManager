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
node .cursor/skills/graph-coverage/scripts/graph-coverage.mjs
```

Optional flags:

- `--changed` — compute blast radius for symbols touched by `git diff` (staged + unstaged). Used by default when a diff exists.
- `--symbol Name` — blast radius for one function, method, class, or struct.
- `--path <file-or-dir>` — restrict analysis to that path under `src/` or `src-tauri/src/`.

The script prints one JSON object to stdout. Do not commit that output.

**Coverage caveat:** `covers` edges link tests to code by static name mention (`*.test.*`, `*.spec.*`, `#[test]`, `scripts/version.test.mjs`). This is not executed line or branch coverage. State that clearly in every report.

## Interpret JSON

| Field | Meaning |
|-------|---------|
| `nodes` | `{ id, kind, name, file, line, exported?, tauriCommand? }` |
| `edges` | `{ from, to, kind }` where `kind` is `cfg`, `call`, `inherits`, `def-use`, or `covers` |
| `metrics.nodeCoverage` | ratio of reachable nodes with a `covers` edge |
| `metrics.edgeCoverage` | ratio of `cfg` edges in test-linked functions |
| `metrics.defUse` | pairs, unused defs, ambiguous uses |
| `hotspots` | nodes sorted by in-degree + out-degree |
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
| Node (NC) | … | … | …% |
| Edge (EC) | … | … | …% |
| Def-use pairs | … | … | — |

## Blast radius
(For `--changed`, `--symbol`, or full graph seeds.)

## Review order (high-risk paths)
1. [file:line] `symbol` — reason (hotspot / low coverage / in blast radius)
…
```

Prioritize hotspots with low `covers` linkage and nodes in the blast radius of the current change.
