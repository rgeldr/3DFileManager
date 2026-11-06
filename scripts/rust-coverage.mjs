#!/usr/bin/env node
/**
 * Production-only Rust coverage.
 *
 * Ignore regex is Jason's Windows pattern, plus `/tests_` so the same
 * test files are ignored when llvm-cov prints forward-slash paths:
 *   (\tests_|/tests_|_tests_|flow_tests_)
 * On Windows, `\tests_` already matches `tests_*.rs`. `/tests_` adds no
 * extra Windows paths, so the production totals stay comparable to R0.
 *
 * Floors are that measured production baseline (R0). They are regression
 * gates, not an assumption that lines or regions are already ≥80%.
 * Next ratchet, after a Windows run clears it: functions ≥55%, lines ≥78%, regions ≥78%.
 * Final target for all three: ≥80%.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PRODUCTION_IGNORE = "(\\\\tests_|/tests_|_tests_|flow_tests_)";

/** Jason, Windows, production filter, after PR #60. */
export const COVERAGE_FLOORS = {
  regions: 77.55,
  functions: 53.09,
  lines: 77.37,
};

export function productionLlvmCovFlags() {
  return `--ignore-filename-regex=${PRODUCTION_IGNORE}`;
}

export function parseLlvmCovSummary(text) {
  const plain = text.replace(/\u001b\[[0-9;]*m/g, "");
  const line = plain.split(/\r?\n/).find((row) => row.trimStart().startsWith("TOTAL"));
  if (!line) return null;
  const percents = [...line.matchAll(/(\d+(?:\.\d+)?)%/g)].map((match) => Number(match[1]));
  if (percents.length < 3) return null;
  return { regions: percents[0], functions: percents[1], lines: percents[2] };
}

export function coverageBelowFloor(measured, floors = COVERAGE_FLOORS) {
  const misses = [];
  for (const key of ["regions", "functions", "lines"]) {
    if (measured[key] < floors[key]) {
      misses.push(`${key} ${measured[key]}% is below the R0 floor ${floors[key]}%`);
    }
  }
  return misses;
}

function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const tauriDir = path.join(scriptDir, "..", "src-tauri");
  const flags = productionLlvmCovFlags();
  const run = spawnSync("cargo", ["llvm-cov", "--summary-only"], {
    cwd: tauriDir,
    env: { ...process.env, LLVM_COV_FLAGS: flags },
    encoding: "utf8",
    shell: false,
  });
  if (run.stdout) process.stdout.write(run.stdout);
  if (run.stderr) process.stderr.write(run.stderr);
  if (run.error) {
    console.error(run.error.message);
    process.exit(1);
  }
  if (run.status !== 0) process.exit(run.status === null ? 1 : run.status);
  const measured = parseLlvmCovSummary(`${run.stdout ?? ""}\n${run.stderr ?? ""}`);
  if (!measured) {
    console.error("cargo llvm-cov did not print a TOTAL row.");
    process.exit(1);
  }
  const misses = coverageBelowFloor(measured);
  if (misses.length > 0) {
    console.error(misses.join("\n"));
    process.exit(1);
  }
  console.error(
    `production coverage: regions ${measured.regions}% (floor ${COVERAGE_FLOORS.regions}%), ` +
      `functions ${measured.functions}% (floor ${COVERAGE_FLOORS.functions}%), ` +
      `lines ${measured.lines}% (floor ${COVERAGE_FLOORS.lines}%)`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
