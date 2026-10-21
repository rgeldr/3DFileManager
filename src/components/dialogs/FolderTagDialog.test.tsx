import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryModel } from "../../hooks/useLibrary";
import { FolderTagDialog } from "./FolderTagDialog";

const addTagsToFiles = vi.fn();
const addTagsUnderFolder = vi.fn();

vi.mock("../../api", () => ({
  api: {
    addTagsToFiles: (...args: unknown[]) => addTagsToFiles(...args),
    addTagsUnderFolder: (...args: unknown[]) => addTagsUnderFolder(...args),
  },
}));

afterEach(() => {
  cleanup();
  addTagsToFiles.mockReset();
  addTagsUnderFolder.mockReset();
});

function app(overrides: Record<string, unknown> = {}): LibraryModel {
  return {
    tags: ["FDM"],
    folderTagTarget: { folderId: null, name: "2 selected files", fileIds: [1, 2] },
    setFolderTagTarget: vi.fn(),
    folderTagInput: "Terrain, FDM",
    setFolderTagInput: vi.fn(),
    folderTagFileCount: 2,
    setError: vi.fn(),
    refreshLists: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as LibraryModel;
}

describe("Tag dialog", () => {
  it("adds tags to the selected files only", async () => {
    addTagsToFiles.mockResolvedValue(2);
    const model = app();
    render(<FolderTagDialog app={model} />);
    expect(screen.getByRole("heading", { name: "Add tags" })).toBeTruthy();
    expect(screen.getByText("2 selected files")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(addTagsToFiles).toHaveBeenCalledWith([1, 2], ["Terrain", "FDM"]);
    expect(addTagsUnderFolder).not.toHaveBeenCalled();
    await waitFor(() => expect(model.setFolderTagTarget).toHaveBeenCalledWith(null));
    expect(model.refreshLists).toHaveBeenCalled();
  });

  it("suggests the tag after the last comma and keeps the earlier tags", () => {
    render(<FolderTagDialog app={app({
      tags: ["FDM", "skeleton", "resin"],
      folderTagInput: "FDM, ske",
      folderTagTarget: { folderId: 5, name: "Flexi Animals" },
    })} />);
    const options = document.querySelectorAll("#folder-tag-suggestions option");
    expect([...options].map((option) => option.getAttribute("value"))).toEqual(["FDM, skeleton"]);
  });

  it("still tags a whole folder for folder targets", () => {
    addTagsUnderFolder.mockResolvedValue(3);
    render(<FolderTagDialog app={app({ folderTagTarget: { folderId: 5, name: "Minis" } })} />);
    expect(screen.getByRole("heading", { name: "Tag folder contents" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(addTagsUnderFolder).toHaveBeenCalledWith(5, ["Terrain", "FDM"]);
    expect(addTagsToFiles).not.toHaveBeenCalled();
  });
});
