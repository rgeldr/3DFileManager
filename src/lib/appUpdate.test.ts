import { beforeEach, describe, expect, it, vi } from "vitest";

const check = vi.fn();
const relaunch = vi.fn();

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: () => check(),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: () => relaunch(),
}));

import { checkForAppUpdate, installPendingUpdate } from "./appUpdate";

function release(version: string, currentVersion = "26.10.9") {
  return {
    version,
    currentVersion,
    downloadAndInstall: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  check.mockReset();
  relaunch.mockReset();
});

describe("app update check", () => {
  it("offers a newer date version and installs it through the updater", async () => {
    const update = release("26.10.26");
    check.mockResolvedValue(update);

    await expect(checkForAppUpdate("silent")).resolves.toEqual({ status: "available", version: "26.10.26" });
    await expect(installPendingUpdate()).resolves.toEqual({ ok: true });
    expect(update.downloadAndInstall).toHaveBeenCalledOnce();
    expect(relaunch).toHaveBeenCalledOnce();
    expect(update.close).not.toHaveBeenCalled();
  });

  it("treats an equal or older release as up to date", async () => {
    const older = release("26.10.9", "26.10.26");
    check.mockResolvedValueOnce(older);
    await expect(checkForAppUpdate("interactive")).resolves.toEqual({ status: "current" });
    expect(older.close).toHaveBeenCalledOnce();

    check.mockResolvedValueOnce(null);
    await expect(checkForAppUpdate("interactive")).resolves.toEqual({ status: "current" });
  });

  it("stays quiet when a silent check fails and reports a manual check error", async () => {
    check.mockRejectedValue(new Error("error sending request: connection refused"));
    await expect(checkForAppUpdate("silent")).resolves.toEqual({ status: "skipped" });
    await expect(checkForAppUpdate("interactive")).resolves.toEqual({
      status: "error",
      message: "Could not check for updates. Check your connection and try again.",
    });
  });

  it("reports install failure without relaunching", async () => {
    const update = release("26.11.1", "26.10.26");
    update.downloadAndInstall.mockRejectedValue(new Error("signature mismatch"));
    check.mockResolvedValue(update);
    await checkForAppUpdate("interactive");
    await expect(installPendingUpdate()).resolves.toEqual({
      ok: false,
      message: "Could not install the update. signature mismatch",
    });
    expect(relaunch).not.toHaveBeenCalled();
  });
});
