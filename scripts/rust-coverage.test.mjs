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
TOTAL                         21000               4196    80.00%        1510               659     56.30%       11600              2298    80.20%
`;
assert.deepEqual(parseLlvmCovSummary(summary), {
  regions: 80.0,
  functions: 56.3,
  lines: 80.2,
});
assert.deepEqual(coverageBelowFloor(parseLlvmCovSummary(summary)), []);

const jason = { regions: 80.02, functions: 56.37, lines: 80.34 };
assert.deepEqual(coverageBelowFloor(jason), []);

const droppedFunctions = { regions: 80.0, functions: 56.29, lines: 80.2 };
assert.equal(coverageBelowFloor(droppedFunctions).length, 1);
assert.match(coverageBelowFloor(droppedFunctions)[0], /functions 56.29%/);

assert.equal(COVERAGE_FLOORS.functions, 56.3);
assert.equal(COVERAGE_FLOORS.lines, 80.2);
assert.equal(COVERAGE_FLOORS.regions, 80.0);
assert.ok(COVERAGE_FLOORS.lines >= 80);
assert.ok(COVERAGE_FLOORS.regions >= 80);
assert.ok(COVERAGE_FLOORS.functions > 56.37 - 0.1);
assert.ok(COVERAGE_FLOORS.functions <= 56.37);
assert.ok(COVERAGE_FLOORS.lines <= 80.34);
assert.ok(COVERAGE_FLOORS.regions <= 80.02);
