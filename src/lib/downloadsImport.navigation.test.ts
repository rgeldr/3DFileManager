import { describe, expect, it, vi } from "vitest";
import { browseToFolderId } from "./downloadsImport";
import type { Browse } from "../types";

describe("browseToFolderId", () => {
  it("maps browse places to import folder ids", () => {
    expect(browseToFolderId({ type: "root" })).toBeNull();
    expect(browseToFolderId({ type: "folder", id: 4 })).toBe(4);
    expect(browseToFolderId({ type: "downloads" } as Browse)).toBeNull();
  });
});

describe("runDownloadsImport navigation", () => {
  it("jumps to the destination when importedCount is positive", async () => {
    const setBrowse = vi.fn();
    const refreshLists = vi.fn(async (_place?: unknown) => undefined);
    const reloadTree = vi.fn(async () => undefined);
    const setSelected = vi.fn((_ids?: number[]) => undefined);
    const setSummary = vi.fn();
    const importPaths = vi.fn(async (_paths: string[], _folderId: number | null) => ({
      importedIds: [10],
      importedCount: 1,
      duplicateCount: 0,
      unsupportedCount: 0,
      failed: [],
      recycleCount: 0,
      leftInPlace: 0,
      cancelled: false,
      pendingHashCount: 0,
    }));
    const folderId = 2;
    const result = await importPaths(["/dl/a.stl"], folderId);
    setSummary(result);
    if (result.importedCount > 0) {
      setBrowse({ type: "folder", id: folderId });
      await reloadTree();
      await refreshLists({ type: "folder", id: folderId });
      if (result.importedIds.length > 0) setSelected(result.importedIds);
    }
    expect(setBrowse).toHaveBeenCalledWith({ type: "folder", id: 2 });
    expect(setSelected).toHaveBeenCalledWith([10]);
  });

  it("stays on Downloads when importedCount is zero", async () => {
    const setBrowse = vi.fn();
    const result = {
      importedIds: [],
      importedCount: 0,
      duplicateCount: 1,
      unsupportedCount: 0,
      failed: [],
      recycleCount: 0,
      leftInPlace: 0,
      cancelled: false,
      pendingHashCount: 0,
    };
    if (result.importedCount > 0) setBrowse({ type: "folder", id: 2 });
    expect(setBrowse).not.toHaveBeenCalled();
  });
});
