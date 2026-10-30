import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Browse, FolderRow } from "../types";
import { FolderPicker } from "./FolderPicker";

afterEach(() => cleanup());

function folder(id: number, parentId: number | null, name: string): FolderRow {
  return { id, parentId, name, relpath: name, sortOrder: id };
}

const tree = [
  folder(1, null, "Alpha"),
  folder(2, null, "Beta"),
  folder(3, 1, "Nested"),
];

describe("FolderPicker", () => {
  it("renders breadcrumb navigation and forwards browse changes", () => {
    const onBrowseChange = vi.fn();
    render(
      <FolderPicker
        folders={tree}
        libraryName="Library"
        browse={{ type: "folder", id: 3 }}
        onBrowseChange={onBrowseChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    expect(onBrowseChange).toHaveBeenCalledWith({ type: "folder", id: 1 });
  });

  it("truncates long folder names with a title tooltip", () => {
    const long = folder(9, null, "Very long folder name that should truncate in the list");
    render(
      <FolderPicker
        folders={[long]}
        libraryName="Library"
        browse={{ type: "root" }}
        onBrowseChange={() => undefined}
      />,
    );
    const nameButton = screen.getByRole("option", { name: long.name });
    expect(nameButton.getAttribute("title")).toBe(long.name);
  });

  it("shows every breadcrumb on a deep path and does not mark the chevron expanded", () => {
    const onBrowseChange = vi.fn();
    const deep = [
      folder(1, null, "L1"),
      folder(2, 1, "L2"),
      folder(3, 2, "L3"),
      folder(4, 3, "L4"),
      folder(5, 4, "L5"),
    ];
    render(
      <FolderPicker
        folders={deep}
        libraryName="Library"
        browse={{ type: "folder", id: 5 }}
        onBrowseChange={onBrowseChange}
      />,
    );
    expect(screen.queryByText("…")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "L2" }));
    expect(onBrowseChange).toHaveBeenCalledWith({ type: "folder", id: 2 });
    expect(document.querySelector(".tree-twist-icon.open")).toBeNull();
  });

  it("enters the row that received Enter, not a different highlighted row", () => {
    const onBrowseChange = vi.fn();
    render(
      <FolderPicker
        folders={tree}
        libraryName="Library"
        browse={{ type: "root" }}
        onBrowseChange={onBrowseChange}
      />,
    );
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByRole("option", { name: "Beta" }), { key: "Enter" });
    expect(onBrowseChange).toHaveBeenCalledWith({ type: "folder", id: 2 });
  });

  it("scrolls only the immediate children and moves the active row into view", () => {
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    const folders = [
      ...Array.from({ length: 30 }, (_, index) => folder(index + 1, null, `Folder ${index + 1}`)),
      folder(500, 1, "Nested"),
    ];
    render(
      <FolderPicker
        folders={folders}
        libraryName="Library"
        browse={{ type: "root" }}
        onBrowseChange={() => undefined}
      />,
    );
    expect(screen.getAllByRole("option")).toHaveLength(30);
    expect(screen.queryByRole("option", { name: "Nested" })).toBeNull();
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" });
    expect(scrollIntoView).toHaveBeenCalled();
    const list = screen.getByRole("listbox", { name: "Destination folder" });
    expect(list.getAttribute("aria-activedescendant")).toBe(screen.getByRole("option", { name: "Folder 1" }).id);
    delete (HTMLElement.prototype as { scrollIntoView?: () => void }).scrollIntoView;
  });

  it("returns focus to the folder list after stepping in", () => {
    function Harness() {
      const [browse, setBrowse] = useState<Browse>({ type: "root" });
      return (
        <FolderPicker folders={tree} libraryName="Library" browse={browse} onBrowseChange={setBrowse} />
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("option", { name: "Alpha" }));
    expect(document.activeElement).toBe(screen.getByRole("listbox", { name: "Destination folder" }));
  });
});
