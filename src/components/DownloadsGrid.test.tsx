import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DownloadsGrid } from "./DownloadsGrid";
import type { DownloadRow } from "../types";

afterEach(() => cleanup());

const rows: DownloadRow[] = [
  { name: "a.stl", relativeDir: "", ext: "stl", sizeBytes: 1, mtime: 1, absolutePath: "/d/a.stl" },
  { name: "b.stl", relativeDir: "boats", ext: "stl", sizeBytes: 2, mtime: 2, absolutePath: "/d/boats/b.stl" },
  { name: "c.stl", relativeDir: "boats", ext: "stl", sizeBytes: 3, mtime: 3, absolutePath: "/d/boats/c.stl" },
];

function renderGrid(selected: string[]) {
  const onSelectionChange = vi.fn();
  const onContextMenu = vi.fn();
  render(
    <DownloadsGrid
      rows={rows}
      selected={selected}
      onSelectionChange={onSelectionChange}
      onSort={() => undefined}
      onContextMenu={onContextMenu}
    />,
  );
  return { onSelectionChange, onContextMenu };
}

describe("DownloadsGrid", () => {
  it("replaces on click, toggles with Ctrl, and ranges with Shift in path order", () => {
    const replaced = renderGrid([]);
    fireEvent.click(screen.getByRole("button", { name: /a\.stl/ }));
    expect(replaced.onSelectionChange).toHaveBeenCalledWith(["/d/a.stl"]);
    cleanup();

    const toggled = renderGrid(["/d/a.stl"]);
    fireEvent.click(screen.getByRole("button", { name: /c\.stl/ }), { ctrlKey: true });
    expect(toggled.onSelectionChange).toHaveBeenCalledWith(["/d/a.stl", "/d/boats/c.stl"]);
    cleanup();

    const ranged = renderGrid(["/d/a.stl"]);
    fireEvent.click(screen.getByRole("button", { name: /c\.stl/ }), { shiftKey: true });
    expect(ranged.onSelectionChange).toHaveBeenCalledWith(["/d/a.stl", "/d/boats/b.stl", "/d/boats/c.stl"]);
  });

  it("keeps a right-click inside the selection and replaces one outside it", () => {
    const selected = ["/d/a.stl", "/d/boats/b.stl", "/d/boats/c.stl"];
    const inside = renderGrid(selected);
    fireEvent.contextMenu(screen.getByRole("button", { name: /b\.stl/ }));
    expect(inside.onSelectionChange).toHaveBeenCalledWith(selected);
    expect(inside.onContextMenu.mock.calls[0][2]).toEqual(selected);
    cleanup();

    const outside = renderGrid(["/d/a.stl"]);
    fireEvent.contextMenu(screen.getByRole("button", { name: /c\.stl/ }));
    expect(outside.onSelectionChange).toHaveBeenCalledWith(["/d/boats/c.stl"]);
    expect(outside.onContextMenu.mock.calls[0][2]).toEqual(["/d/boats/c.stl"]);
    expect(outside.onContextMenu.mock.calls[0][1]).toBe("/d/boats/c.stl");
  });
});
