import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryModel } from "../../hooks/useLibrary";
import type { FileRow } from "../../types";
import { FileContextMenu } from "./FileContextMenu";

vi.mock("../../api", () => ({ api: {} }));

afterEach(cleanup);

function app(selected: number[], fileId: number) {
  const calls = {
    setFileMenu: vi.fn(),
    setCreatorTarget: vi.fn(),
    setCreatorValue: vi.fn(),
    setFolderTagTarget: vi.fn(),
    setFolderTagInput: vi.fn(),
    openRenameFile: vi.fn(),
  };
  const model = {
    fileMenu: { x: 10, y: 20, fileId },
    selected,
    files: [
      { id: 1, sortName: "benchy" },
      { id: 2, sortName: "cube" },
    ] as FileRow[],
    setError: vi.fn(),
    ...calls,
  } as unknown as LibraryModel;
  return { model, calls };
}

describe("File context menu", () => {
  it("opens Set Creator for every selected file", () => {
    const { model, calls } = app([1, 2], 1);
    render(<FileContextMenu app={model} />);
    fireEvent.click(screen.getByRole("menuitem", { name: "Set Creator…" }));
    expect(calls.setFileMenu).toHaveBeenCalledWith(null);
    expect(calls.setCreatorValue).toHaveBeenCalledWith("");
    expect(calls.setCreatorTarget).toHaveBeenCalledWith({
      folderId: null,
      name: "2 selected files",
      fileIds: [1, 2],
    });
  });

  it("opens Add tags named after a single selected file", () => {
    const { model, calls } = app([2], 2);
    render(<FileContextMenu app={model} />);
    fireEvent.click(screen.getByRole("menuitem", { name: "Add tags…" }));
    expect(calls.setFileMenu).toHaveBeenCalledWith(null);
    expect(calls.setFolderTagInput).toHaveBeenCalledWith("");
    expect(calls.setFolderTagTarget).toHaveBeenCalledWith({
      folderId: null,
      name: "cube",
      fileIds: [2],
    });
  });

  it("targets only the clicked file when it is outside the selection", () => {
    const { model, calls } = app([1, 2], 3);
    render(<FileContextMenu app={model} />);
    fireEvent.click(screen.getByRole("menuitem", { name: "Set Creator…" }));
    expect(calls.setCreatorTarget).toHaveBeenCalledWith({
      folderId: null,
      name: "1 file",
      fileIds: [3],
    });
  });

  it("renames the clicked file", () => {
    const { model, calls } = app([1, 2], 2);
    render(<FileContextMenu app={model} />);
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    expect(calls.setFileMenu).toHaveBeenCalledWith(null);
    expect(calls.openRenameFile).toHaveBeenCalledWith(2);
  });
});
