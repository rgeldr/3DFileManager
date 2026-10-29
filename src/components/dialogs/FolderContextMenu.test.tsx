import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FolderContextMenu, type FolderMenuState } from "./FolderContextMenu";

afterEach(cleanup);

function renderMenu(menu: FolderMenuState | null) {
  const calls = {
    onClose: vi.fn(),
    onNewInFolder: vi.fn(),
    onRenameFolder: vi.fn(),
    onDeleteFolder: vi.fn(),
    onTagFolder: vi.fn(),
    onSetCreator: vi.fn(),
    onReveal: vi.fn(),
    onRescan: vi.fn(),
  };
  render(<FolderContextMenu menu={menu} {...calls} />);
  return calls;
}

describe("Folder context menu", () => {
  it("offers the existing folder actions for a grid folder", () => {
    const calls = renderMenu({ x: 12, y: 24, folderId: 7 });
    const items = screen.getAllByRole("menuitem").map((item) => item.textContent);
    expect(items).toEqual([
      "New folder",
      "Rename",
      "Delete",
      "Tag contents…",
      "Set Creator…",
      "Show in Explorer",
      "Rescan",
    ]);
    fireEvent.pointerDown(screen.getByRole("menuitem", { name: "Show in Explorer" }));
    expect(calls.onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("menuitem", { name: "Show in Explorer" }));
    expect(calls.onReveal).toHaveBeenCalledWith(7);
    expect(calls.onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    expect(calls.onRenameFolder).toHaveBeenCalledWith(7);
    fireEvent.click(screen.getByRole("menuitem", { name: "Set Creator…" }));
    expect(calls.onSetCreator).toHaveBeenCalledWith(7);
    fireEvent.click(screen.getByRole("menuitem", { name: "Tag contents…" }));
    expect(calls.onTagFolder).toHaveBeenCalledWith(7);
    fireEvent.click(screen.getByRole("menuitem", { name: "New folder" }));
    expect(calls.onNewInFolder).toHaveBeenCalledWith(7);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(calls.onDeleteFolder).toHaveBeenCalledWith(7);
    fireEvent.click(screen.getByRole("menuitem", { name: "Rescan" }));
    expect(calls.onRescan).toHaveBeenCalledWith(7);
  });

  it("omits rename and delete on the library root", () => {
    const calls = renderMenu({ x: 0, y: 0, folderId: null });
    expect(screen.queryByRole("menuitem", { name: "Rename" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Delete" })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Show in Explorer" }));
    expect(calls.onReveal).toHaveBeenCalledWith(null);
    fireEvent.click(screen.getByRole("menuitem", { name: "Tag contents…" }));
    expect(calls.onTagFolder).toHaveBeenCalledWith(null);
  });

  it("renders nothing when closed", () => {
    renderMenu(null);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes on Escape, an outside pointer, and scroll", () => {
    const calls = renderMenu({ x: 4, y: 8, folderId: 3 });
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.pointerDown(document.body);
    window.dispatchEvent(new Event("scroll"));
    expect(calls.onClose).toHaveBeenCalledTimes(3);
    fireEvent.keyDown(window, { key: "Enter" });
    expect(calls.onClose).toHaveBeenCalledTimes(3);
  });
});
