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
TOTAL                         21000               3941    81.00%        1510               639     57.70%       11600              2180    81.20%
`;
assert.deepEqual(parseLlvmCovSummary(summary), {
  regions: 81.0,
  functions: 57.7,
  lines: 81.2,
});
assert.deepEqual(coverageBelowFloor(parseLlvmCovSummary(summary)), []);

const jasonEarlier = { regions: 80.02, functions: 56.37, lines: 80.34 };
assert.ok(coverageBelowFloor(jasonEarlier).length >= 1);

const droppedFunctions = { regions: 81.0, functions: 57.69, lines: 81.2 };
assert.equal(coverageBelowFloor(droppedFunctions).length, 1);
assert.match(coverageBelowFloor(droppedFunctions)[0], /functions 57.69%/);

const jasonLater = { regions: 81.08, functions: 57.81, lines: 81.29 };
assert.deepEqual(coverageBelowFloor(jasonLater), []);

assert.equal(COVERAGE_FLOORS.functions, 57.7);
assert.equal(COVERAGE_FLOORS.lines, 81.2);
assert.equal(COVERAGE_FLOORS.regions, 81.0);
assert.ok(COVERAGE_FLOORS.lines >= 80);
assert.ok(COVERAGE_FLOORS.regions >= 80);
assert.ok(COVERAGE_FLOORS.functions > 57.81 - 0.2);
assert.ok(COVERAGE_FLOORS.functions <= 57.81);
assert.ok(COVERAGE_FLOORS.lines <= 81.29);
assert.ok(COVERAGE_FLOORS.regions <= 81.08);
