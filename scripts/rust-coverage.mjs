#!/usr/bin/env node
/**
 * Production-only Rust coverage (llvm-cov). Ignores test-only source paths.
 * Thresholds (Jason R0, post-PR #60, production filter):
 *   Regions ~77.55%, Functions ~53.09%, Lines ~77.37% — ratchet toward ≥80% each.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const tauriDir = path.join(scriptDir, "..", "src-tauri");
const ignore =
  "(\\\\tests_|_tests_|flow_tests_)";
const env = {
  ...process.env,
  LLVM_COV_FLAGS: `--ignore-filename-regex=${ignore}`,
};

const cargo = process.platform === "win32" ? "cargo" : "cargo";
const run = spawnSync(cargo, ["llvm-cov", "--summary-only"], {
  cwd: tauriDir,
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(run.status === null ? 1 : run.status);
