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
TOTAL                         21000               3899    81.40%        1510               619     59.00%       11600              2134    81.60%
`;
assert.deepEqual(parseLlvmCovSummary(summary), {
  regions: 81.4,
  functions: 59.0,
  lines: 81.6,
});
assert.deepEqual(coverageBelowFloor(parseLlvmCovSummary(summary)), []);

const jasonEvening = { regions: 81.5, functions: 59.15, lines: 81.75 };
assert.deepEqual(coverageBelowFloor(jasonEvening), []);

const jasonEarlier = { regions: 81.08, functions: 57.81, lines: 81.29 };
assert.ok(coverageBelowFloor(jasonEarlier).length >= 1);

const droppedFunctions = { regions: 81.4, functions: 58.99, lines: 81.6 };
assert.equal(coverageBelowFloor(droppedFunctions).length, 1);
assert.match(coverageBelowFloor(droppedFunctions)[0], /functions 58.99%/);

assert.equal(COVERAGE_FLOORS.functions, 59.0);
assert.equal(COVERAGE_FLOORS.lines, 81.6);
assert.equal(COVERAGE_FLOORS.regions, 81.4);
assert.ok(COVERAGE_FLOORS.lines >= 80);
assert.ok(COVERAGE_FLOORS.regions >= 80);
assert.ok(COVERAGE_FLOORS.functions > 59.15 - 0.2);
assert.ok(COVERAGE_FLOORS.functions <= 59.15);
assert.ok(COVERAGE_FLOORS.lines <= 81.75);
assert.ok(COVERAGE_FLOORS.regions <= 81.5);
