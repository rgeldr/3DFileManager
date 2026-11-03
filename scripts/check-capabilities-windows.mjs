import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const capabilityPath = path.join(root, "src-tauri/capabilities/default.json");

const json = JSON.parse(fs.readFileSync(capabilityPath, "utf8"));
const windows = json.windows ?? [];
assert.ok(
  windows.some((pattern: string) => pattern === "win-*"),
  "default capability must include win-* for secondary windows",
);

console.log("capabilities window patterns ok");
