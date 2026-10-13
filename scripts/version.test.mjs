import assert from "node:assert/strict";
import { replaceOnce } from "./version.mjs";

const lf = `{
  "name": "3d-file-library",
  "version": "26.10.2",
  "other": { "version": "9.9.9" }
}`;

const crlf = lf.replace(/\n/g, "\r\n");

const nextLf = replaceOnce(
  lf,
  `"name": "3d-file-library",\n  "version": "26.10.2"`,
  `"name": "3d-file-library",\n  "version": "26.10.3"`,
);
assert.match(nextLf, /"version": "26.10.3"/);
assert.match(nextLf, /"other": { "version": "9.9.9" }/);

const nextCrlf = replaceOnce(
  crlf,
  `"name": "3d-file-library",\n  "version": "26.10.2"`,
  `"name": "3d-file-library",\n  "version": "26.10.3"`,
);
assert.ok(nextCrlf.includes("\r\n"));
assert.match(nextCrlf, /"version": "26.10.3"/);

let threw = false;
try {
  replaceOnce(lf, `"name": "3d-file-library",\n  "version": "26.10.9"`, `"version": "26.10.3"`);
} catch {
  threw = true;
}
assert.equal(threw, true);

console.log("version.test.mjs ok");
