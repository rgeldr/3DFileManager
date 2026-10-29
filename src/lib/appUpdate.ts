import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { isNewerAppVersion } from "./appVersion";

export type UpdateCheck =
  | { status: "available"; version: string }
  | { status: "current" }
  | { status: "skipped" }
  | { status: "error"; message: string };

let pending: Update | null = null;

export async function remember(update: Update | null) {
  if (pending && pending !== update) {
    await pending.close().catch(() => undefined);
  }
  pending = update;
}

export function checkErrorMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  if (/offline|network|dns|timed out|connection|fetch|os error/i.test(detail)) {
    return "Could not check for updates. Check your connection and try again.";
  }
  return `Could not check for updates. ${detail}`;
}

export async function checkForAppUpdate(mode: "silent" | "interactive"): Promise<UpdateCheck> {
  try {
    const update = await check();
    if (!update) {
      await remember(null);
      return { status: "current" };
    }
    const newer = isNewerAppVersion(update.version, update.currentVersion);
    if (newer === false) {
      await remember(null);
      await update.close().catch(() => undefined);
      return { status: "current" };
    }
    await remember(update);
    return { status: "available", version: update.version };
  } catch (error) {
    if (mode === "silent") return { status: "skipped" };
    return { status: "error", message: checkErrorMessage(error) };
  }
}

export async function installPendingUpdate(): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!pending) return { ok: false, message: "No update is ready to install." };
  try {
    await pending.downloadAndInstall();
    await relaunch();
    return { ok: true };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `Could not install the update. ${detail}` };
  }
}
