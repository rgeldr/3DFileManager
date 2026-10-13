import { readFileSync, writeFileSync } from "node:fs";

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

function replaceOnce(text, from, to) {
  const index = text.indexOf(from);
  if (index < 0) {
    fail(`Could not find ${from}`);
  }
  return text.slice(0, index) + to + text.slice(index + from.length);
}

function bump() {
  const current = agreedVersion();
  const match = versionPattern.exec(current);
  const prefix = currentPrefix();
  const next = `${match[1]}.${match[2]}` === prefix
    ? `${prefix}.${Number(match[3]) + 1}`
    : `${prefix}.1`;

  writeFileSync(files.pkg, replaceOnce(read(files.pkg), `"version": "${current}"`, `"version": "${next}"`));
  let lock = read(files.lock);
  lock = replaceOnce(lock, `"name": "3d-file-library",\n  "version": "${current}"`, `"name": "3d-file-library",\n  "version": "${next}"`);
  lock = replaceOnce(lock, `"name": "3d-file-library",\n      "version": "${current}"`, `"name": "3d-file-library",\n      "version": "${next}"`);
  writeFileSync(files.lock, lock);
  writeFileSync(files.tauri, replaceOnce(read(files.tauri), `"version": "${current}"`, `"version": "${next}"`));
  writeFileSync(files.cargo, replaceOnce(read(files.cargo), `version = "${current}"`, `version = "${next}"`));
  writeFileSync(
    files.cargoLock,
    replaceOnce(
      read(files.cargoLock),
      `name = "file-library"\nversion = "${current}"`,
      `name = "file-library"\nversion = "${next}"`,
    ),
  );
  console.log(`${current} -> ${next}`);
}

const command = process.argv[2];
if (command === "check") check();
else if (command === "bump") bump();
else fail("Use: node scripts/version.mjs check|bump");
