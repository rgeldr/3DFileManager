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
TOTAL                         21000               3842    81.70%        1510               608     59.70%       11600              2088    82.00%
`;
assert.deepEqual(parseLlvmCovSummary(summary), {
  regions: 81.7,
  functions: 59.7,
  lines: 82.0,
});
assert.deepEqual(coverageBelowFloor(parseLlvmCovSummary(summary)), []);

const jasonLatest = { regions: 81.84, functions: 59.78, lines: 82.2 };
assert.deepEqual(coverageBelowFloor(jasonLatest), []);

const jasonEarlier = { regions: 81.5, functions: 59.15, lines: 81.75 };
assert.ok(coverageBelowFloor(jasonEarlier).length >= 3);

const droppedFunctions = { regions: 81.7, functions: 59.69, lines: 82.0 };
assert.equal(coverageBelowFloor(droppedFunctions).length, 1);
assert.match(coverageBelowFloor(droppedFunctions)[0], /functions 59.69%/);

assert.equal(COVERAGE_FLOORS.functions, 59.7);
assert.equal(COVERAGE_FLOORS.lines, 82.0);
assert.equal(COVERAGE_FLOORS.regions, 81.7);
assert.ok(COVERAGE_FLOORS.lines >= 80);
assert.ok(COVERAGE_FLOORS.regions >= 80);
assert.ok(COVERAGE_FLOORS.functions <= 59.78);
assert.ok(COVERAGE_FLOORS.lines <= 82.2);
assert.ok(COVERAGE_FLOORS.regions <= 81.84);
