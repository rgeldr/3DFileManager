import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FolderRow } from "../types";
import { Sidebar } from "./Sidebar";

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
