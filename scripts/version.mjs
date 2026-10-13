import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const versionPattern = /^(\d{2})\.(0[1-9]|1[0-2])\.([1-9]\d*)$/;

const files = {
  pkg: new URL("../package.json", import.meta.url),
  lock: new URL("../package-lock.json", import.meta.url),
  tauri: new URL("../src-tauri/tauri.conf.json", import.meta.url),
  cargo: new URL("../src-tauri/Cargo.toml", import.meta.url),
  cargoLock: new URL("../src-tauri/Cargo.lock", import.meta.url),
};

function read(url) {
  return readFileSync(url, "utf8");
}

function currentPrefix() {
  const now = new Date();
  const year = String(now.getFullYear() % 100).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}.${month}`;
}

function versions() {
  const pkg = JSON.parse(read(files.pkg)).version;
  const tauri = JSON.parse(read(files.tauri)).version;
  const cargo = read(files.cargo).match(/^version = "([^"]+)"/m)?.[1];
  return { "package.json": pkg, "tauri.conf.json": tauri, "Cargo.toml": cargo };
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function agreedVersion() {
  const found = versions();
  const values = Object.values(found);
  if (values.some((value) => value == null)) {
    fail("Could not read a project version.");
  }
  const unique = new Set(values);
  if (unique.size !== 1) {
    fail(`Versions differ:\n${Object.entries(found).map(([file, value]) => `  ${file}: ${value}`).join("\n")}`);
  }
  const version = values[0];
  if (!versionPattern.test(version)) {
    fail(`${version} is not YY.MM.N. Example: 26.10.1`);
  }
  return version;
}

function check() {
  const version = agreedVersion();
  const prefix = version.slice(0, 5);
  const expected = currentPrefix();
  if (prefix !== expected) {
    fail(`${version} is not this month (${expected}). Run npm run version:bump`);
  }
  console.log(version);
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function replaceVersionNear(text, anchor, current, next, maxGapLines = 6) {
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const anchorIndex = lines.findIndex((line) => line.includes(anchor));
  if (anchorIndex < 0) {
    throw new Error(`Could not find ${JSON.stringify(anchor)}`);
  }
  const needle = `"version": "${current}"`;
  const limit = Math.min(lines.length, anchorIndex + maxGapLines + 1);
  for (let i = anchorIndex; i < limit; i += 1) {
    if (!lines[i].includes(needle)) continue;
    lines[i] = lines[i].replace(needle, `"version": "${next}"`);
    return lines.join(newline);
  }
  throw new Error(`Could not find version ${current} near ${JSON.stringify(anchor)}`);
}

export function replaceOnce(text, from, to) {
  const pattern = from.split("\n").map(escapeRegExp).join("\\r?\\n");
  const match = new RegExp(pattern).exec(text);
  if (!match) {
    throw new Error(`Could not find ${JSON.stringify(from)}`);
  }
  const newline = match[0].includes("\r\n") ? "\r\n" : "\n";
  const replacement = to.split("\n").join(newline);
  return text.slice(0, match.index) + replacement + text.slice(match.index + match[0].length);
}

function bump() {
  const current = agreedVersion();
  const match = versionPattern.exec(current);
  const prefix = currentPrefix();
  const next = `${match[1]}.${match[2]}` === prefix
    ? `${prefix}.${Number(match[3]) + 1}`
    : `${prefix}.1`;

  let updates;
  try {
  let lock = read(files.lock);
  lock = replaceOnce(lock, `"name": "3d-file-library",\n  "version": "${current}"`, `"name": "3d-file-library",\n  "version": "${next}"`);
  lock = replaceOnce(lock, `"name": "3d-file-library",\n      "version": "${current}"`, `"name": "3d-file-library",\n      "version": "${next}"`);
  updates = [
    [files.pkg, replaceVersionNear(read(files.pkg), `"name": "3d-file-library"`, current, next)],
    [files.lock, lock],
    [files.tauri, replaceOnce(
      read(files.tauri),
      `"productName": "3D File Library",\n  "version": "${current}"`,
      `"productName": "3D File Library",\n  "version": "${next}"`,
    )],
    [files.cargo, replaceOnce(read(files.cargo), `version = "${current}"`, `version = "${next}"`)],
    [files.cargoLock, replaceOnce(
      read(files.cargoLock),
      `name = "file-library"\nversion = "${current}"`,
      `name = "file-library"\nversion = "${next}"`,
    )],
  ];
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
  for (const [url, text] of updates) writeFileSync(url, text);
  console.log(`${current} -> ${next}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const command = process.argv[2];
  if (command === "check") check();
  else if (command === "bump") bump();
  else fail("Use: node scripts/version.mjs check|bump");
}
