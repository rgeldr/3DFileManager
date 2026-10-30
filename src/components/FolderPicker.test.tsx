import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FolderRow } from "../types";
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
    const nameButton = screen.getByRole("button", { name: long.name });
    expect(nameButton.getAttribute("title")).toBe(long.name);
  });
});
