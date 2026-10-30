import { describe, expect, it } from "vitest";
import { browseToFolderId, downloadsDestinationKey, downloadsImportNavigation, folderLabel } from "./downloadsImport";
import type { FolderRow } from "../types";

const folder = (id: number, name: string): FolderRow => ({
  id,
  parentId: null,
  name,
  relpath: name,
  sortOrder: 0,
});

describe("browseToFolderId", () => {
  it("maps a library folder to its id and every other place to the library root", () => {
    expect(browseToFolderId({ type: "root" })).toBeNull();
    expect(browseToFolderId({ type: "folder", id: 4 })).toBe(4);
    expect(browseToFolderId({ type: "downloads" })).toBeNull();
  });
});

describe("downloadsDestinationKey", () => {
  it("uses the folder id and one root key for library root and Downloads", () => {
    expect(downloadsDestinationKey({ type: "folder", id: 4 })).toBe("4");
    expect(downloadsDestinationKey({ type: "root" })).toBe("root");
    expect(downloadsDestinationKey({ type: "downloads" })).toBe("root");
  });
});

describe("downloadsImportNavigation", () => {
  it("jumps to the chosen folder and selects the returned ids when the import added files", () => {
    expect(downloadsImportNavigation({ importedCount: 1, importedIds: [10] }, 2)).toEqual({
      place: { type: "folder", id: 2 },
      selectedIds: [10],
    });
    expect(downloadsImportNavigation({ importedCount: 1, importedIds: [4] }, null)).toEqual({
      place: { type: "root" },
      selectedIds: [4],
    });
  });

  it("still jumps when the id list was cleared above the summary cap", () => {
    expect(downloadsImportNavigation({ importedCount: 201, importedIds: [] }, 2)).toEqual({
      place: { type: "folder", id: 2 },
      selectedIds: [],
    });
  });

  it("stays put when nothing was imported", () => {
    expect(downloadsImportNavigation({ importedCount: 0, importedIds: [] }, 2)).toEqual({
      place: null,
      selectedIds: [],
    });
  });
});

describe("folderLabel", () => {
  it("names the library root, a folder, Downloads, and a missing folder", () => {
    expect(folderLabel([], { type: "root" }, "Library")).toBe("Library");
    expect(folderLabel([folder(2, "Models")], { type: "folder", id: 2 }, "Library")).toBe("Models");
    expect(folderLabel([], { type: "downloads" }, "Library")).toBe("Downloads");
    expect(folderLabel([], { type: "folder", id: 9 }, "Library")).toBe("Folder");
  });
});
