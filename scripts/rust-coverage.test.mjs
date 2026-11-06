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
TOTAL                         21000               4368    79.20%        1510               667     55.80%       11600              2378    79.50%
`;
assert.deepEqual(parseLlvmCovSummary(summary), {
  regions: 79.2,
  functions: 55.8,
  lines: 79.5,
});
assert.deepEqual(coverageBelowFloor(parseLlvmCovSummary(summary)), []);

const jason = { regions: 78.95, functions: 55.15, lines: 78.92 };
assert.equal(coverageBelowFloor(jason).length, 3);

const droppedLines = { regions: 79.2, functions: 55.8, lines: 79.49 };
assert.equal(coverageBelowFloor(droppedLines).length, 1);
assert.match(coverageBelowFloor(droppedLines)[0], /lines 79.49%/);

assert.equal(COVERAGE_FLOORS.functions, 55.8);
assert.equal(COVERAGE_FLOORS.lines, 79.5);
assert.equal(COVERAGE_FLOORS.regions, 79.2);
assert.ok(COVERAGE_FLOORS.lines < 80);
assert.ok(COVERAGE_FLOORS.regions < 80);
assert.ok(COVERAGE_FLOORS.functions < 80);
assert.ok(COVERAGE_FLOORS.functions > 55.15);
assert.ok(COVERAGE_FLOORS.lines > 78.92);
assert.ok(COVERAGE_FLOORS.regions > 78.95);
