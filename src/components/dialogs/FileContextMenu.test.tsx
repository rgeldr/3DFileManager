import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryModel } from "../../hooks/useLibrary";
import type { ExternalProgram, FileRow } from "../../types";
import { FileContextMenu } from "./FileContextMenu";

const openInProgram = vi.fn<(fileId: number, programId: string) => Promise<void>>();

vi.mock("../../api", () => ({
  api: {
    openInProgram: (fileId: number, programId: string) => openInProgram(fileId, programId),
  },
}));

afterEach(() => {
  cleanup();
  openInProgram.mockReset();
  openInProgram.mockResolvedValue(undefined);
});

const orca: ExternalProgram = {
  id: "orca",
  name: "OrcaSlicer",
  path: "C:\\Program Files\\OrcaSlicer\\orca-slicer.exe",
};

function app(selected: number[], fileId: number, programs: ExternalProgram[] = []) {
  const calls = {
    setFileMenu: vi.fn(),
    setCreatorTarget: vi.fn(),
    setCreatorValue: vi.fn(),
    setFolderTagTarget: vi.fn(),
    setFolderTagInput: vi.fn(),
    openRenameFile: vi.fn(),
    setExternalProgramsOpen: vi.fn(),
    setError: vi.fn(),
  };
  const model = {
    fileMenu: { x: 10, y: 20, fileId },
    selected,
    files: [
      { id: 1, sortName: "benchy" },
      { id: 2, sortName: "cube" },
    ] as FileRow[],
    settings: { externalPrograms: programs },
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

  it("keeps Show in Explorer and drops Open and Open containing folder", () => {
    const { model } = app([1, 2], 2);
    render(<FileContextMenu app={model} />);
    const items = screen.getAllByRole("menuitem").map((item) => item.textContent);
    expect(items).toEqual([
      "Open in…",
      "Configure programs…",
      "Show in Explorer",
      "Rename",
      "Set Creator…",
      "Add tags…",
    ]);
    expect(screen.queryByRole("menuitem", { name: "Open" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Open containing folder" })).toBeNull();
  });

  it("renames the clicked file", () => {
    const { model, calls } = app([1, 2], 2);
    render(<FileContextMenu app={model} />);
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    expect(calls.setFileMenu).toHaveBeenCalledWith(null);
    expect(calls.openRenameFile).toHaveBeenCalledWith(2);
  });

  it("offers Configure programs when no programs are saved", () => {
    const { model, calls } = app([1, 2], 1);
    render(<FileContextMenu app={model} />);
    const items = screen.getAllByRole("menuitem").map((item) => item.textContent);
    expect(items[0]).toBe("Open in…");
    fireEvent.click(screen.getByRole("menuitem", { name: "Configure programs…" }));
    expect(calls.setFileMenu).toHaveBeenCalledWith(null);
    expect(calls.setExternalProgramsOpen).toHaveBeenCalledWith(true);
    expect(openInProgram).not.toHaveBeenCalled();
  });

  it("opens only the right-clicked file in the chosen program", async () => {
    const { model, calls } = app([1, 2], 1, [orca]);
    render(<FileContextMenu app={model} />);
    expect(screen.queryByRole("menuitem", { name: "Configure programs…" })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "OrcaSlicer" }));
    expect(calls.setFileMenu).toHaveBeenCalledWith(null);
    expect(openInProgram).toHaveBeenCalledWith(1, "orca");
    expect(openInProgram).toHaveBeenCalledTimes(1);
  });

  it("shows the missing-program error", async () => {
    openInProgram.mockRejectedValue("Can't find OrcaSlicer. It is not at C:\\missing\\orca-slicer.exe.");
    const { model, calls } = app([2], 2, [orca]);
    render(<FileContextMenu app={model} />);
    fireEvent.click(screen.getByRole("menuitem", { name: "OrcaSlicer" }));
    await waitFor(() => {
      expect(calls.setError).toHaveBeenCalledWith(
        "Can't find OrcaSlicer. It is not at C:\\missing\\orca-slicer.exe.",
      );
    });
  });

  it("lists programs in saved order and opens the clicked one", () => {
    const bambu: ExternalProgram = {
      id: "bambu",
      name: "Bambu Studio",
      path: "C:\\Program Files\\Bambu Studio\\bambu-studio.exe",
    };
    const prusa: ExternalProgram = {
      id: "prusa",
      name: "PrusaSlicer",
      path: "C:\\Program Files\\Prusa3D\\PrusaSlicer\\prusa-slicer.exe",
    };
    const { model, calls } = app([1, 2], 2, [orca, bambu, prusa]);
    render(<FileContextMenu app={model} />);
    const items = screen.getAllByRole("menuitem").map((item) => item.textContent);
    expect(items.slice(0, 4)).toEqual(["Open in…", "OrcaSlicer", "Bambu Studio", "PrusaSlicer"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "PrusaSlicer" }));
    expect(openInProgram).toHaveBeenCalledTimes(1);
    expect(openInProgram).toHaveBeenCalledWith(2, "prusa");
    expect(calls.setFileMenu).toHaveBeenCalledWith(null);
  });

  it("turns a thrown error into text", async () => {
    openInProgram.mockRejectedValue(new Error("spawn failed"));
    const { model, calls } = app([1], 1, [orca]);
    render(<FileContextMenu app={model} />);
    fireEvent.click(screen.getByRole("menuitem", { name: "OrcaSlicer" }));
    await waitFor(() => expect(calls.setError).toHaveBeenCalledWith("Error: spawn failed"));
  });

  it("offers Configure programs when settings have not loaded", () => {
    const { model } = app([1], 1, [orca]);
    model.settings = null;
    render(<FileContextMenu app={model} />);
    expect(screen.getByRole("menuitem", { name: "Configure programs…" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "OrcaSlicer" })).toBeNull();
  });

  it("flips the submenu when it would run off the window", () => {
    const { model } = app([1], 1, [orca]);
    render(<FileContextMenu app={model} />);
    const branch = document.querySelector(".menu-branch") as HTMLElement;
    const submenu = branch.querySelector(".menu-submenu") as HTMLElement;
    const box = (right: number): DOMRect =>
      ({
        right,
        left: right - 160,
        top: 0,
        bottom: 24,
        width: 160,
        height: 24,
        x: right - 160,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    branch.getBoundingClientRect = () => box(700);
    Object.defineProperty(submenu, "offsetWidth", { configurable: true, value: 180 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
    fireEvent.mouseEnter(branch);
    expect(submenu.classList.contains("flip")).toBe(true);

    branch.getBoundingClientRect = () => box(120);
    fireEvent.mouseEnter(branch);
    expect(submenu.classList.contains("flip")).toBe(false);
  });
});
