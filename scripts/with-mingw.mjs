import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import { homedir } from "node:os";

const env = { ...process.env };
const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
const pathValue = env[pathKey] ?? "";
const hasDlltool = pathValue.split(delimiter).some((entry) => existsSync(join(entry, "dlltool.exe")));

if (!hasDlltool) {
  const mingwBin = join(homedir(), "mingw", "winlibs", "mingw64", "bin");
  if (!existsSync(join(mingwBin, "dlltool.exe"))) {
    console.error("dlltool.exe was not found. Add a MinGW bin directory to PATH.");
    process.exit(1);
  }
  env[pathKey] = `${mingwBin}${delimiter}${pathValue}`;
  env.CC ??= "x86_64-w64-mingw32-gcc";
}

const cli = join(process.cwd(), "node_modules", "@tauri-apps", "cli", "tauri.js");
const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: "inherit",
  env,
});
process.exit(result.status ?? 1);
