import { describe, expect, it } from "vitest";
import { deleteKeyCommand, deleteKeyFocus, focusedFolderId, isTypingTarget } from "./deleteKey";

describe("deleteKeyCommand", () => {
  const ready = {
    key: "Delete",
    typing: false,
    dialogOpen: false,
    focus: "grid" as const,
    selectedCount: 2,
    folderId: 4,
  };

  it("deletes selected files when the grid is focused", () => {
    expect(deleteKeyCommand(ready)).toBe("files");
  });

  it("deletes the focused folder when the sidebar is focused", () => {
    expect(deleteKeyCommand({ ...ready, focus: "sidebar", selectedCount: 0 })).toBe("folder");
  });

  it("does nothing while typing, in a dialog, on the library root, or without a selection", () => {
    expect(deleteKeyCommand({ ...ready, typing: true })).toBeNull();
    expect(deleteKeyCommand({ ...ready, dialogOpen: true })).toBeNull();
    expect(deleteKeyCommand({ ...ready, key: "Backspace" })).toBeNull();
    expect(deleteKeyCommand({ ...ready, focus: "sidebar", folderId: null })).toBeNull();
    expect(deleteKeyCommand({ ...ready, focus: "grid", selectedCount: 0 })).toBeNull();
    expect(deleteKeyCommand({ ...ready, focus: "other" })).toBeNull();
  });

  it("ignores inputs, textareas, and contenteditable targets", () => {
    const input = document.createElement("input");
    const area = document.createElement("textarea");
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    const grid = document.createElement("div");
    grid.className = "grid-wrap";
    const tile = document.createElement("button");
    grid.appendChild(tile);
    const sidebar = document.createElement("div");
    sidebar.className = "sidebar-scroll";
    const row = document.createElement("div");
    row.dataset.treeKey = "folder:12";
    const label = document.createElement("span");
    row.appendChild(label);
    sidebar.appendChild(row);
    document.body.append(input, area, editable, grid, sidebar);

    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(area)).toBe(true);
    expect(isTypingTarget(editable)).toBe(true);
    expect(isTypingTarget(tile)).toBe(false);
    expect(deleteKeyFocus(tile)).toBe("grid");
    expect(deleteKeyFocus(label)).toBe("sidebar");
    expect(focusedFolderId(label)).toBe(12);
    expect(focusedFolderId(tile)).toBeNull();
  });
});
