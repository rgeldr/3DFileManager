import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FileRow } from "../types";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";

const deleteFiles = vi.fn();

vi.mock("../api", () => ({
  api: {
    deleteFiles: (...args: unknown[]) => deleteFiles(...args),
  },
}));

function sidebarFolderTarget(folderId: number) {
  const sidebar = document.createElement("div");
  sidebar.className = "sidebar-scroll";
  const row = document.createElement("div");
  row.dataset.treeKey = `folder:${folderId}`;
  const label = document.createElement("span");
  row.appendChild(label);
  sidebar.appendChild(row);
  document.body.appendChild(sidebar);
  return label;
}

function gridTarget() {
  const grid = document.createElement("div");
  grid.className = "grid-wrap";
  const tile = document.createElement("button");
  grid.appendChild(tile);
  document.body.appendChild(grid);
  return tile;
}

function baseProps(overrides: Record<string, unknown> = {}) {
  const runDiskOp = vi.fn(async (opts: { title: string; run: () => Promise<{ cancelled: boolean }> }) => {
    await opts.run();
  });
  const files: FileRow[] = [{ id: 9, sortName: "benchy" } as FileRow];
  return {
    browse: { type: "root" as const },
    dialogOpen: false,
    folderTagTarget: null,
    fileMenu: null,
    selected: [9],
    openDeleteFolderConfirm: vi.fn(),
    files,
    runDiskOp,
    setSelected: vi.fn(),
    refreshLists: vi.fn(async () => undefined),
    ...overrides,
  };
}

afterEach(() => {
  deleteFiles.mockReset();
  document.body.innerHTML = "";
});

describe("useKeyboardShortcuts", () => {
  it("deletes one selected file through runDiskOp", () => {
    const tile = gridTarget();
    const props = baseProps();
    renderHook(() => useKeyboardShortcuts(props));
    act(() => {
      tile.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    });
    expect(props.runDiskOp).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Deleting "benchy"...' }),
    );
    expect(deleteFiles).toHaveBeenCalledWith([9]);
  });

  it("uses a plural title for multiple files", () => {
    const tile = gridTarget();
    const props = baseProps({ selected: [1, 2, 3] });
    renderHook(() => useKeyboardShortcuts(props));
    act(() => {
      tile.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    });
    expect(props.runDiskOp).toHaveBeenCalledWith(expect.objectContaining({ title: "Deleting 3 files..." }));
  });

  it("ignores Delete while a dialog, tag target, or file menu is open", () => {
    const dialog = baseProps({ dialogOpen: true });
    renderHook(() => useKeyboardShortcuts(dialog));
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    });
    expect(dialog.runDiskOp).not.toHaveBeenCalled();

    const tag = baseProps({ folderTagTarget: { folderId: 1, name: "x" } });
    renderHook(() => useKeyboardShortcuts(tag));
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    });
    expect(tag.runDiskOp).not.toHaveBeenCalled();

    const menu = baseProps({ fileMenu: { fileId: 1 } });
    renderHook(() => useKeyboardShortcuts(menu));
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    });
    expect(menu.runDiskOp).not.toHaveBeenCalled();
  });

  it("deletes the focused sidebar folder instead of files", () => {
    const label = sidebarFolderTarget(12);
    const props = baseProps({ selected: [], browse: { type: "folder", id: 99 } });
    renderHook(() => useKeyboardShortcuts(props));
    act(() => {
      label.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    });
    expect(props.openDeleteFolderConfirm).toHaveBeenCalledWith(12);
    expect(props.runDiskOp).not.toHaveBeenCalled();
  });

  it("removes the listener on unmount", () => {
    const props = baseProps();
    const { unmount } = renderHook(() => useKeyboardShortcuts(props));
    unmount();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    });
    expect(props.runDiskOp).not.toHaveBeenCalled();
  });
});
