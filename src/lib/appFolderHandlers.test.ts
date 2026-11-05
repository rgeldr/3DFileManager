import { describe, expect, it } from "vitest";
import { folderKey } from "../components/Sidebar";
import type { FolderRow } from "../types";
import { browseFromSidebarKey, creatorSelectOptions, folderDisplayName, rescanTitle } from "./appFolderHandlers";

describe("appFolderHandlers", () => {
  const folders: FolderRow[] = [
    { id: 2, name: "Prints", parentId: null, relpath: "prints", sortOrder: 0 },
    { id: 5, name: "Miniatures", parentId: 2, relpath: "prints/mini", sortOrder: 1 },
  ];

  it("folderDisplayName uses library name for null and folder name when found", () => {
    expect(folderDisplayName(null, folders, "Library")).toBe("Library");
    expect(folderDisplayName(2, folders, "Library")).toBe("Prints");
    expect(folderDisplayName(99, folders, "Library")).toBe("Folder");
  });

  it("rescanTitle matches rescan disk dialog copy", () => {
    expect(rescanTitle(null, folders, "Library")).toBe('Rescanning "Library"...');
    expect(rescanTitle(2, folders, "Library")).toBe('Rescanning "Prints"...');
    expect(rescanTitle(99, folders, "Library")).toBe('Rescanning "folder"...');
  });

  it("creatorSelectOptions keeps list or appends active creator", () => {
    expect(creatorSelectOptions(["a", "b"], "")).toEqual(["a", "b"]);
    expect(creatorSelectOptions(["a", "b"], "a")).toEqual(["a", "b"]);
    expect(creatorSelectOptions(["a", "b"], "z")).toEqual(["a", "b", "z"]);
  });

  it("browseFromSidebarKey maps sidebar keys to browse places", () => {
    expect(browseFromSidebarKey("downloads")).toEqual({ type: "downloads" });
    expect(browseFromSidebarKey("root")).toEqual({ type: "root" });
    expect(browseFromSidebarKey(folderKey(12))).toEqual({ type: "folder", id: 12 });
  });
});
