import { describe, expect, it } from "vitest";
import type { FolderRow } from "../types";
import {
  destinationDisplayPath,
  folderIdFromTarget,
  immediateChildFolders,
  normalizePickerBrowse,
  pickerActivationFolderId,
  pickerListKeyAction,
  pickerParentPlace,
  resolvePickerBrowse,
} from "./folderPicker";

function folder(id: number, parentId: number | null, name: string): FolderRow {
  return { id, parentId, name, relpath: name, sortOrder: id };
}

const tree = [
  folder(1, null, "Bases and Toppers"),
  folder(2, 1, "Bases"),
  folder(3, 2, "Cobblestone"),
  folder(4, null, "Terrain"),
];

describe("normalizePickerBrowse", () => {
  it("maps Downloads to the library root", () => {
    expect(normalizePickerBrowse({ type: "downloads" })).toEqual({ type: "root" });
    expect(normalizePickerBrowse({ type: "folder", id: 2 })).toEqual({ type: "folder", id: 2 });
  });
});

describe("immediateChildFolders", () => {
  it("lists only direct children of the current browse location", () => {
    expect(immediateChildFolders(tree, { type: "root" }).map((row) => row.name)).toEqual([
      "Bases and Toppers",
      "Terrain",
    ]);
    expect(immediateChildFolders(tree, { type: "folder", id: 1 }).map((row) => row.name)).toEqual(["Bases"]);
    expect(immediateChildFolders(tree, { type: "folder", id: 3 })).toEqual([]);
  });

  it("keeps same names at different depths as separate ids and sorts numerically", () => {
    const folders = [
      folder(11, null, "Oval"),
      folder(10, null, "Folder 10"),
      folder(2, null, "Folder 2"),
      folder(12, 11, "Oval"),
      folder(13, 12, "Nested"),
    ];
    expect(immediateChildFolders(folders, { type: "root" }).map((row) => row.id)).toEqual([2, 10, 11]);
    expect(immediateChildFolders(folders, { type: "folder", id: 11 }).map((row) => row.id)).toEqual([12]);
    expect(immediateChildFolders(folders, { type: "folder", id: 12 }).map((row) => row.name)).toEqual(["Nested"]);
  });
});

describe("pickerParentPlace", () => {
  it("steps out to the parent folder or root", () => {
    expect(pickerParentPlace(tree, { type: "folder", id: 3 })).toEqual({ type: "folder", id: 2 });
    expect(pickerParentPlace(tree, { type: "folder", id: 2 })).toEqual({ type: "folder", id: 1 });
    expect(pickerParentPlace(tree, { type: "folder", id: 1 })).toEqual({ type: "root" });
    expect(pickerParentPlace(tree, { type: "root" })).toBeNull();
    expect(pickerParentPlace([folder(3, 2, "Cobblestone")], { type: "folder", id: 3 })).toEqual({ type: "root" });
  });
});

describe("resolvePickerBrowse", () => {
  it("keeps a live folder and drops a deleted one to the library root", () => {
    expect(resolvePickerBrowse(tree, { type: "folder", id: 2 })).toEqual({ type: "folder", id: 2 });
    expect(resolvePickerBrowse(tree, { type: "folder", id: 99 })).toEqual({ type: "root" });
    expect(resolvePickerBrowse(tree, { type: "downloads" })).toEqual({ type: "root" });
    expect(resolvePickerBrowse(tree, { type: "root" })).toEqual({ type: "root" });
  });
});

describe("destinationDisplayPath", () => {
  it("joins breadcrumb labels for the copy-into line", () => {
    expect(destinationDisplayPath("3D Print Library", tree, { type: "root" })).toBe("3D Print Library");
    expect(destinationDisplayPath("3D Print Library", tree, { type: "folder", id: 2 })).toBe(
      "3D Print Library / Bases and Toppers / Bases",
    );
    expect(destinationDisplayPath("3D Print Library", tree, { type: "folder", id: 99 })).toBe("3D Print Library");
    const deep = [
      folder(1, null, "L1"),
      folder(2, 1, "L2"),
      folder(3, 2, "L3"),
      folder(4, 3, "L4"),
      folder(5, 4, "L5"),
    ];
    expect(destinationDisplayPath("Library", deep, { type: "folder", id: 5 })).toBe("Library / L1 / L2 / L3 / L4 / L5");
  });
});

describe("pickerActivationFolderId", () => {
  const children = immediateChildFolders(tree, { type: "root" });

  it("prefers the row under the key event over the highlight index", () => {
    expect(pickerActivationFolderId({ targetFolderId: children[1].id, focusIndex: 0, children })).toBe(children[1].id);
    expect(pickerActivationFolderId({ targetFolderId: null, focusIndex: 0, children })).toBe(children[0].id);
    expect(pickerActivationFolderId({ targetFolderId: 99, focusIndex: 1, children })).toBe(children[1].id);
    expect(pickerActivationFolderId({ targetFolderId: null, focusIndex: -1, children })).toBeNull();
  });
});

describe("folderIdFromTarget", () => {
  it("reads the folder id from the row under the event target", () => {
    const row = document.createElement("div");
    row.setAttribute("data-folder-id", "4");
    const child = document.createElement("span");
    row.append(child);
    expect(folderIdFromTarget(child)).toBe(4);
    expect(folderIdFromTarget(row)).toBe(4);
    expect(folderIdFromTarget(null)).toBeNull();
    expect(folderIdFromTarget(document.createElement("div"))).toBeNull();
  });
});

describe("pickerListKeyAction", () => {
  const children = immediateChildFolders(tree, { type: "root" });

  it("moves focus with arrow keys", () => {
    expect(pickerListKeyAction({ key: "ArrowDown", focusIndex: -1, childCount: 2, children })).toEqual({
      type: "focus",
      index: 0,
    });
    expect(pickerListKeyAction({ key: "ArrowDown", focusIndex: 0, childCount: 2, children })).toEqual({
      type: "focus",
      index: 1,
    });
    expect(pickerListKeyAction({ key: "ArrowUp", focusIndex: 1, childCount: 2, children })).toEqual({
      type: "focus",
      index: 0,
    });
  });

  it("enters the focused folder on Enter", () => {
    expect(pickerListKeyAction({ key: "Enter", focusIndex: 0, childCount: 2, children })).toEqual({
      type: "enter",
      folderId: children[0].id,
    });
  });

  it("ignores Backspace and other keys so the dialog can handle them once", () => {
    expect(pickerListKeyAction({ key: "Backspace", focusIndex: 0, childCount: 2, children })).toBeNull();
    expect(pickerListKeyAction({ key: "a", focusIndex: 0, childCount: 2, children })).toBeNull();
    expect(pickerListKeyAction({ key: "ArrowDown", focusIndex: -1, childCount: 0, children: [] })).toBeNull();
    expect(pickerListKeyAction({ key: "ArrowDown", focusIndex: 1, childCount: 2, children })).toBeNull();
    expect(pickerListKeyAction({ key: "ArrowUp", focusIndex: 0, childCount: 2, children })).toBeNull();
    expect(pickerListKeyAction({ key: "Enter", focusIndex: -1, childCount: 2, children })).toBeNull();
  });
});
