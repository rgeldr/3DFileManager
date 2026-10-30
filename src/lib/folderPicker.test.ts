import { describe, expect, it } from "vitest";
import type { FolderRow } from "../types";
import {
  destinationDisplayPath,
  folderHasChildren,
  immediateChildFolders,
  normalizePickerBrowse,
  pickerListKeyAction,
  pickerParentPlace,
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
});

describe("pickerParentPlace", () => {
  it("steps out to the parent folder or root", () => {
    expect(pickerParentPlace(tree, { type: "folder", id: 3 })).toEqual({ type: "folder", id: 2 });
    expect(pickerParentPlace(tree, { type: "folder", id: 2 })).toEqual({ type: "folder", id: 1 });
    expect(pickerParentPlace(tree, { type: "folder", id: 1 })).toEqual({ type: "root" });
    expect(pickerParentPlace(tree, { type: "root" })).toBeNull();
  });
});

describe("destinationDisplayPath", () => {
  it("joins breadcrumb labels for the copy-into line", () => {
    expect(destinationDisplayPath("3D Print Library", tree, { type: "root" })).toBe("3D Print Library");
    expect(destinationDisplayPath("3D Print Library", tree, { type: "folder", id: 2 })).toBe(
      "3D Print Library / Bases and Toppers / Bases",
    );
  });
});

describe("folderHasChildren", () => {
  it("detects nested folders", () => {
    expect(folderHasChildren(tree, 1)).toBe(true);
    expect(folderHasChildren(tree, 3)).toBe(false);
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

  it("goes up on Backspace", () => {
    expect(pickerListKeyAction({ key: "Backspace", focusIndex: 0, childCount: 2, children })).toEqual({ type: "up" });
  });

  it("ignores navigation when there are no subfolders", () => {
    expect(pickerListKeyAction({ key: "ArrowDown", focusIndex: -1, childCount: 0, children: [] })).toBeNull();
    expect(pickerListKeyAction({ key: "Backspace", focusIndex: -1, childCount: 0, children: [] })).toEqual({
      type: "up",
    });
  });
});
