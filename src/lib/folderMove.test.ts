import { describe, expect, it } from "vitest";
import type { FolderRow } from "../types";
import { FOLDER_ROOT_DROP_ID, isFolderUnderAncestor, legalFolderDrop } from "./folderMove";

function folder(id: number, parentId: number | null): FolderRow {
  return { id, parentId, name: `f${id}`, relpath: `f${id}`, sortOrder: id };
}

const tree = [folder(1, null), folder(2, 1), folder(3, 2), folder(4, null)];

describe("folderMove", () => {
  it("folderKey ancestry matches parent links", () => {
    expect(isFolderUnderAncestor(tree, 1, 3)).toBe(true);
    expect(isFolderUnderAncestor(tree, 1, 1)).toBe(true);
    expect(isFolderUnderAncestor(tree, 3, 1)).toBe(false);
    expect(isFolderUnderAncestor(tree, 1, null)).toBe(false);
  });

  it("legalFolderDrop accepts another folder and the library root", () => {
    expect(legalFolderDrop(tree, 4, "2")).toBe("2");
    expect(legalFolderDrop(tree, 3, FOLDER_ROOT_DROP_ID)).toBe(FOLDER_ROOT_DROP_ID);
  });

  it("legalFolderDrop rejects self, a descendant, and the current parent", () => {
    expect(legalFolderDrop(tree, 2, "2")).toBeNull();
    expect(legalFolderDrop(tree, 1, "3")).toBeNull();
    expect(legalFolderDrop(tree, 3, "2")).toBeNull();
    expect(legalFolderDrop(tree, 4, FOLDER_ROOT_DROP_ID)).toBeNull();
    expect(legalFolderDrop(tree, 4, "not-a-number")).toBeNull();
  });
});
