import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FolderRow } from "../types";
import { Sidebar, folderKey, isFolderUnderAncestor } from "./Sidebar";

afterEach(cleanup);

const toys: FolderRow = { id: 3, parentId: null, name: "Toys", relpath: "Toys", sortOrder: 0 };

function renderSidebar(pinned = true) {
  const onReveal = vi.fn();
  const onRescan = vi.fn();
  const onPinnedChange = vi.fn();
  render(
    <Sidebar
      folders={[toys]}
      libraryName="3D Print Library"
      browseKey="root"
      dropTarget={null}
      expandHint={null}
      onBrowse={() => undefined}
      onNew={() => undefined}
      onRename={() => undefined}
      onDelete={() => undefined}
      onNewInFolder={() => undefined}
      onRenameFolder={() => undefined}
      onDeleteFolder={() => undefined}
      onTagFolder={() => undefined}
      onSetCreator={() => undefined}
      onReveal={onReveal}
      onRescan={onRescan}
      onMoveFolder={() => undefined}
      pinned={pinned}
      onPinnedChange={onPinnedChange}
    />,
  );
  return { onReveal, onRescan, onPinnedChange };
}

describe("folder ancestry", () => {
  const folders: FolderRow[] = [
    { id: 1, parentId: null, name: "Toys", relpath: "Toys", sortOrder: 0 },
    { id: 2, parentId: 1, name: "Animals", relpath: "Toys/Animals", sortOrder: 0 },
    { id: 3, parentId: 2, name: "Wolves", relpath: "Toys/Animals/Wolves", sortOrder: 0 },
  ];

  it("folderKey and isFolderUnderAncestor follow parent links", () => {
    expect(folderKey(3)).toBe("folder:3");
    expect(isFolderUnderAncestor(folders, 1, 3)).toBe(true);
    expect(isFolderUnderAncestor(folders, 1, 1)).toBe(true);
    expect(isFolderUnderAncestor(folders, 3, 1)).toBe(false);
    expect(isFolderUnderAncestor(folders, 1, null)).toBe(false);
  });
});

describe("folder tree menu", () => {
  it("shows the folder in Explorer and rescans that folder", () => {
    const { onReveal, onRescan } = renderSidebar();
    fireEvent.contextMenu(screen.getByText("Toys"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Show in Explorer" }));
    expect(onReveal).toHaveBeenCalledWith(3);
    fireEvent.contextMenu(screen.getByText("Toys"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Rescan" }));
    expect(onRescan).toHaveBeenCalledWith(3);
  });

  it("lists Downloads before the library root row", () => {
    const onBrowse = vi.fn();
    const { container } = render(
      <Sidebar
        folders={[toys]}
        libraryName="3D Print Library"
        browseKey="downloads"
        dropTarget={null}
        expandHint={null}
        onBrowse={onBrowse}
        onNew={() => undefined}
        onRename={() => undefined}
        onDelete={() => undefined}
        onNewInFolder={() => undefined}
        onRenameFolder={() => undefined}
        onDeleteFolder={() => undefined}
        onTagFolder={() => undefined}
        onSetCreator={() => undefined}
        onReveal={() => undefined}
        onRescan={() => undefined}
        onMoveFolder={() => undefined}
        pinned
        onPinnedChange={() => undefined}
      />,
    );
    const rows = container.querySelectorAll(".sidebar-scroll > .folder-row");
    expect(rows[0]?.classList.contains("downloads-row")).toBe(true);
    expect(rows[0]?.textContent).toContain("Downloads");
    fireEvent.click(screen.getByText("Downloads"));
    expect(onBrowse).toHaveBeenCalledWith("downloads");
  });

  it("browses the library root when its label is clicked", () => {
    const onBrowse = vi.fn();
    render(
      <Sidebar
        folders={[toys]}
        libraryName="3D Print Library"
        browseKey="folder:3"
        dropTarget={null}
        expandHint={null}
        onBrowse={onBrowse}
        onNew={() => undefined}
        onRename={() => undefined}
        onDelete={() => undefined}
        onNewInFolder={() => undefined}
        onRenameFolder={() => undefined}
        onDeleteFolder={() => undefined}
        onTagFolder={() => undefined}
        onSetCreator={() => undefined}
        onReveal={() => undefined}
        onRescan={() => undefined}
        onMoveFolder={() => undefined}
        pinned
        onPinnedChange={() => undefined}
      />,
    );
    fireEvent.click(screen.getByText("3D Print Library"));
    expect(onBrowse).toHaveBeenCalledWith("root");
  });

  it("highlights an external drop target on a folder row", () => {
    const { container } = render(
      <Sidebar
        folders={[toys]}
        libraryName="Library"
        browseKey="root"
        dropTarget="3"
        expandHint={null}
        onBrowse={() => undefined}
        onNew={() => undefined}
        onRename={() => undefined}
        onDelete={() => undefined}
        onNewInFolder={() => undefined}
        onRenameFolder={() => undefined}
        onDeleteFolder={() => undefined}
        onTagFolder={() => undefined}
        onSetCreator={() => undefined}
        onReveal={() => undefined}
        onRescan={() => undefined}
        onMoveFolder={() => undefined}
        pinned
        onPinnedChange={() => undefined}
      />,
    );
    expect(container.querySelector(".folder-row.drop")).toBeTruthy();
  });

  it("moves focus with arrow keys in the tree", () => {
    renderSidebar();
    const toysRow = screen.getByText("Toys").closest("[data-tree-key]") as HTMLElement;
    toysRow.focus();
    fireEvent.keyDown(toysRow, { key: "ArrowUp" });
    const rootRow = screen.getByText("3D Print Library").closest("[data-tree-key]") as HTMLElement;
    expect(document.activeElement).toBe(rootRow);
  });

  it("uses the grid folder icon and keeps the expand arrow in its own column", () => {
    const { container } = render(
      <Sidebar
        folders={[
          toys,
          { id: 8, parentId: 3, name: "Mini", relpath: "Toys/Mini", sortOrder: 0 },
        ]}
        libraryName="3D Print Library"
        browseKey="root"
        dropTarget={null}
        expandHint={null}
        onBrowse={() => undefined}
        onNew={() => undefined}
        onRename={() => undefined}
        onDelete={() => undefined}
        onNewInFolder={() => undefined}
        onRenameFolder={() => undefined}
        onDeleteFolder={() => undefined}
        onTagFolder={() => undefined}
        onSetCreator={() => undefined}
        onReveal={() => undefined}
        onRescan={() => undefined}
        onMoveFolder={() => undefined}
        pinned
        onPinnedChange={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Expand Toys" }));
    const rows = container.querySelectorAll(".folder-row:not(.downloads-row)");
    expect(rows.length).toBe(3);
    for (const row of rows) {
      const icon = row.querySelector(":scope > svg.folder-icon");
      expect(icon?.getAttribute("width")).toBe("16");
      expect(icon?.querySelector("path")?.getAttribute("d")).toBe(
        "M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z",
      );
      const lead = icon?.previousElementSibling;
      expect(
        lead?.classList.contains("tree-twist") || lead?.classList.contains("tree-twist-spacer"),
      ).toBe(true);
    }
    const root = screen.getByText("3D Print Library").closest(".folder-row");
    const parent = screen.getByText("Toys").closest(".folder-row");
    const leaf = screen.getByText("Mini").closest(".folder-row");
    expect(root?.querySelector(":scope > .tree-twist")).toBeTruthy();
    expect(parent?.querySelector(":scope > .tree-twist")).toBeTruthy();
    expect(leaf?.querySelector(":scope > .tree-twist")).toBeNull();
    expect(leaf?.querySelector(":scope > .tree-twist-spacer")).toBeTruthy();
  });

  it("collapses to the pin control", () => {
    const { onPinnedChange } = renderSidebar(true);
    expect(screen.getByText("Toys")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Unpin folders" }));
    expect(onPinnedChange).toHaveBeenCalledWith(false);
    cleanup();
    renderSidebar(false);
    expect(screen.queryByText("Toys")).toBeNull();
    expect(screen.getByRole("button", { name: "Pin folders open" })).toBeTruthy();
  });
});
