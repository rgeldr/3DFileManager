# Coverage metrics after unit test gap implementation

Recorded after completing `unit_test_coverage_gaps.plan.md` (plan file not edited).

## Static graph coverage (`graph-coverage.mjs --summary`)

| Metric | Before (plan baseline) | After |
|--------|------------------------|-------|
| Direct node coverage | 48.9% | **56.8%** (391 / 688) |
| Transitive node coverage | 83.4% | **87.6%** (603 / 688) |
| Edge coverage | 61.2% | **65.1%** (3624 / 5566) |
| Unreached symbols (`reachedFromTest: false`) | 114 | **85** |

## Vitest (`npm run test:unit`)

| Metric | Before (plan baseline) | After |
|--------|------------------------|-------|
| Tests | 210 | **267** |
| Line coverage (`src/`) | 62.8% | **70.0%** |
| Test files | — | 62 passed |

## Rust

`cargo test` in `src-tauri` was not re-run in this session (linker environment). Rust tests added earlier in the plan should be verified locally with MinGW per project docs.
