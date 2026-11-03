import assert from "node:assert/strict";
import {
  effectiveRustTriple,
  parseHostTripleFromRustcVersionOutput,
  shouldUseMingwToolchain,
} from "./mingw-target.mjs";

const rustcSample = `rustc 1.88.0 (6b00bc388 2025-06-23)
binary: rustc
commit-hash: 6b00bc388
commit-date: 2025-06-23
host: x86_64-pc-windows-msvc
release: 1.88.0
LLVM version: 20.1.5
`;

assert.equal(
  parseHostTripleFromRustcVersionOutput(rustcSample),
  "x86_64-pc-windows-msvc",
);
assert.equal(parseHostTripleFromRustcVersionOutput(""), "");

assert.equal(
  effectiveRustTriple({ hostTriple: "x86_64-pc-windows-msvc" }),
  "x86_64-pc-windows-msvc",
);
assert.equal(
  effectiveRustTriple({
    hostTriple: "x86_64-pc-windows-msvc",
    cargoBuildTarget: "x86_64-pc-windows-gnu",
  }),
  "x86_64-pc-windows-gnu",
);
assert.equal(
  effectiveRustTriple({
    hostTriple: "x86_64-unknown-linux-gnu",
    cargoTarget: "aarch64-pc-windows-msvc",
  }),
  "aarch64-pc-windows-msvc",
);

const msvcHost = "x86_64-pc-windows-msvc";
const gnuHost = "x86_64-pc-windows-gnu";

assert.equal(shouldUseMingwToolchain({}, msvcHost), false);
assert.equal(shouldUseMingwToolchain({ CARGO_BUILD_TARGET: msvcHost }, gnuHost), false);
assert.equal(shouldUseMingwToolchain({}, gnuHost), true);
assert.equal(
  shouldUseMingwToolchain({ CARGO_BUILD_TARGET: gnuHost }, msvcHost),
  true,
);
assert.equal(
  shouldUseMingwToolchain({}, "x86_64-unknown-linux-gnu"),
  false,
);
assert.equal(
  shouldUseMingwToolchain(
    { CARGO_BUILD_TARGET: "x86_64-pc-windows-gnu" },
    "x86_64-unknown-linux-gnu",
  ),
  true,
);

console.log("mingw-target.test.mjs ok");
