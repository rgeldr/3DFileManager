import assert from "node:assert/strict";
import {
  COVERAGE_FLOORS,
  coverageBelowFloor,
  parseLlvmCovSummary,
  productionLlvmCovFlags,
  PRODUCTION_IGNORE,
} from "./rust-coverage.mjs";

assert.equal(PRODUCTION_IGNORE, "(\\\\tests_|_tests_|flow_tests_)");
assert.equal(
  productionLlvmCovFlags(),
  "--ignore-filename-regex=(\\\\tests_|_tests_|flow_tests_)",
);

const ignore = new RegExp(PRODUCTION_IGNORE);
assert.match(String.raw`src\commands\tests_files.rs`, ignore);
assert.match(String.raw`src\db\tests_library_move.rs`, ignore);
assert.match("src/import/flow_tests_plan.rs", ignore);
assert.equal(ignore.test("commands/tests_files.rs"), false);
assert.equal(ignore.test("src/commands/files.rs"), false);
assert.equal(ignore.test("src/main.rs"), false);

const summary = `
Filename                      Regions    Missed Regions     Cover   Functions  Missed Functions  Executed       Lines      Missed Lines     Cover
TOTAL                         19732               4429    77.55%        1441               676     53.09%       10728              2428    77.37%
`;
assert.deepEqual(parseLlvmCovSummary(summary), {
  regions: 77.55,
  functions: 53.09,
  lines: 77.37,
});
assert.deepEqual(coverageBelowFloor(parseLlvmCovSummary(summary)), []);

const droppedLines = { regions: 77.55, functions: 53.09, lines: 77.36 };
assert.equal(coverageBelowFloor(droppedLines).length, 1);
assert.match(coverageBelowFloor(droppedLines)[0], /lines 77.36%/);

assert.equal(COVERAGE_FLOORS.functions, 53.09);
assert.equal(COVERAGE_FLOORS.lines, 77.37);
assert.equal(COVERAGE_FLOORS.regions, 77.55);
assert.ok(COVERAGE_FLOORS.lines < 80);
assert.ok(COVERAGE_FLOORS.regions < 80);
assert.ok(COVERAGE_FLOORS.functions < 80);
