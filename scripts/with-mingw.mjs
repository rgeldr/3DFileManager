import { spawnSync } from "node:child_process";
import { existsSync, renameSync } from "node:fs";
import { delimiter, join } from "node:path";
import { homedir } from "node:os";

const env = { ...process.env };
const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
const pathValue = env[pathKey] ?? "";

function mingwBinOnPath() {
  for (const entry of pathValue.split(delimiter)) {
    if (entry && existsSync(join(entry, "dlltool.exe"))) {
      return entry;
    }
  }
  return null;
}

let mingwBin = mingwBinOnPath();
const hasDlltool = mingwBin !== null;

if (!hasDlltool) {
  mingwBin = join(homedir(), "mingw", "winlibs", "mingw64", "bin");
  if (!existsSync(join(mingwBin, "dlltool.exe"))) {
    console.error("dlltool.exe was not found. Add a MinGW bin directory to PATH.");
    process.exit(1);
  }
  env[pathKey] = `${mingwBin}${delimiter}${pathValue}`;
  env.CC ??= "x86_64-w64-mingw32-gcc";
}

// WinLibs GCC 16+ links default-manifest.o automatically. Tauri already embeds an
// app manifest, which makes GNU ld warn about "multiple non-default manifests".
const defaultManifest = join(mingwBin, "..", "x86_64-w64-mingw32", "lib", "default-manifest.o");
const hiddenManifest = `${defaultManifest}.off-3dfilelibrary`;

function hideToolchainDefaultManifest() {
  if (!existsSync(defaultManifest)) {
    return;
  }
  if (existsSync(hiddenManifest)) {
    return;
  }
  renameSync(defaultManifest, hiddenManifest);
}

function restoreToolchainDefaultManifest() {
  if (!existsSync(hiddenManifest) || existsSync(defaultManifest)) {
    return;
  }
  renameSync(hiddenManifest, defaultManifest);
}

hideToolchainDefaultManifest();

const cli = join(process.cwd(), "node_modules", "@tauri-apps", "cli", "tauri.js");
let result;
try {
  result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
    stdio: "inherit",
    env,
  });
} finally {
  restoreToolchainDefaultManifest();
}
process.exit(result?.status ?? 1);
