import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FolderRow } from "../../types";
import type { LibraryModel } from "../../hooks/useLibrary";
import { AddToLibraryDialog } from "./AddToLibraryDialog";

const importPaths = vi.fn();

vi.mock("../../api", () => ({
  api: {
    importPaths: (...args: unknown[]) => importPaths(...args),
  },
}));

afterEach(() => {
  cleanup();
  importPaths.mockReset();
});

function folder(id: number, parentId: number | null, name: string, relpath?: string): FolderRow {
  return { id, parentId, name, relpath: relpath ?? name, sortOrder: id };
}

const libraryTree = [
  folder(1, null, "Bases and Toppers"),
  folder(2, 1, "Bases"),
  folder(3, 2, "Cobblestone"),
  folder(4, null, "Terrain"),
];

function copyIntoLine() {
  return document.querySelector(".folder-picker-destination")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function app(overrides: Record<string, unknown> = {}): LibraryModel {
  return {
    folders: libraryTree,
    libraryName: "3D Print Library",
    creators: ["Ada"],
    tags: ["PLA"],
    tagCounts: [],
    importCreator: "Ada",
    setImportCreator: vi.fn(),
    importTags: ["PLA"],
    setImportTags: vi.fn(),
    importTagText: "benchy",
    setImportTagText: vi.fn(),
    runDownloadsImport: vi.fn(async (paths, folderId) => {
      await importPaths(paths, folderId);
      return true;
    }),
    ...overrides,
  } as unknown as LibraryModel;
}

describe("AddToLibraryDialog", () => {
  it("calls importPaths with every selected path and the browsed folder", async () => {
    importPaths.mockResolvedValue({ importedCount: 1, importedIds: [1] });
    const model = app();
    render(
      <AddToLibraryDialog
        app={model}
        paths={["C:\\Downloads\\a.stl", "C:\\Downloads\\pack.zip"]}
        defaultPlace={{ type: "folder", id: 2 }}
        onClose={() => undefined}
      />,
    );
    expect(copyIntoLine()).toContain("Copy into: 3D Print Library / Bases and Toppers / Bases");
    fireEvent.click(screen.getByRole("button", { name: "Add to library" }));
    await waitFor(() =>
      expect(importPaths).toHaveBeenCalledWith(["C:\\Downloads\\a.stl", "C:\\Downloads\\pack.zip"], 2),
    );
  });

  it("shows only immediate subfolders and steps into a folder", async () => {
    importPaths.mockResolvedValue({ importedCount: 1, importedIds: [1] });
    render(
      <AddToLibraryDialog
        app={app()}
        paths={["/tmp/a.stl"]}
        defaultPlace={{ type: "root" }}
        onClose={() => undefined}
      />,
    );
    const list = screen.getByRole("listbox", { name: "Destination folder" });
    expect([...list.querySelectorAll(".folder-picker-name")].map((node) => node.textContent)).toEqual([
      "Bases and Toppers",
      "Terrain",
    ]);
    const bases = screen.getByRole("option", { name: "Bases and Toppers" });
    expect(bases.querySelector(".tree-twist-icon.open")).toBeNull();
    fireEvent.click(bases.querySelector(".tree-twist")!);
    expect(copyIntoLine()).toBe("Copy into: 3D Print Library / Bases and Toppers");
    expect([...list.querySelectorAll(".folder-picker-name")].map((node) => node.textContent)).toEqual(["Bases"]);
    fireEvent.click(screen.getByRole("button", { name: "Add to library" }));
    await waitFor(() => expect(importPaths).toHaveBeenCalledWith(["/tmp/a.stl"], 1));
  });

  it("steps out with Up and via breadcrumb", () => {
    render(
      <AddToLibraryDialog
        app={app()}
        paths={["/tmp/a.stl"]}
        defaultPlace={{ type: "folder", id: 3 }}
        onClose={() => undefined}
      />,
    );
    expect(copyIntoLine()).toContain("Cobblestone");
    fireEvent.click(screen.getByRole("button", { name: "Up one folder" }));
    expect(copyIntoLine()).toBe("Copy into: 3D Print Library / Bases and Toppers / Bases");
    fireEvent.click(screen.getByRole("button", { name: "Bases and Toppers" }));
    expect(copyIntoLine()).toBe("Copy into: 3D Print Library / Bases and Toppers");
    fireEvent.click(screen.getByRole("button", { name: "3D Print Library" }));
    expect(copyIntoLine()).toBe("Copy into: 3D Print Library");
  });

  it("shows an empty-subfolder message", () => {
    render(
      <AddToLibraryDialog
        app={app()}
        paths={["/tmp/a.stl"]}
        defaultPlace={{ type: "folder", id: 3 }}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByText("No subfolders here.")).toBeTruthy();
  });

  it("offers comma tag suggestions like the summary dialog", () => {
    render(
      <AddToLibraryDialog
        app={app({ importTagText: "PLA, ben", importTags: [], tags: ["PLA", "benchy"] })}
        paths={["/tmp/a.stl"]}
        defaultPlace={{ type: "root" }}
        onClose={() => undefined}
      />,
    );
    const options = document.querySelectorAll("#add-library-tags option");
    expect([...options].map((option) => option.getAttribute("value"))).toEqual(["PLA, benchy"]);
  });

  it("closes after an import that starts and stays open when it does not", async () => {
    const onClose = vi.fn();
    const started = app({ runDownloadsImport: vi.fn(async () => true) });
    render(
      <AddToLibraryDialog
        app={started}
        paths={["/tmp/a.stl"]}
        defaultPlace={{ type: "root" }}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add to library" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

    onClose.mockClear();
    const blocked = app({ runDownloadsImport: vi.fn(async () => false) });
    render(
      <AddToLibraryDialog
        app={blocked}
        paths={["/tmp/a.stl"]}
        defaultPlace={{ type: "root" }}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Add to library" })[1]);
    await waitFor(() => expect(blocked.runDownloadsImport).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("ignores a second click while the first import is still running", async () => {
    let release: (started: boolean) => void = () => undefined;
    const runDownloadsImport = vi.fn(() => new Promise<boolean>((resolve) => {
      release = resolve;
    }));
    const onClose = vi.fn();
    render(
      <AddToLibraryDialog
        app={app({ runDownloadsImport })}
        paths={["/tmp/a.stl"]}
        defaultPlace={{ type: "folder", id: 2 }}
        onClose={onClose}
      />,
    );
    const button = screen.getByRole("button", { name: "Add to library" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(runDownloadsImport).toHaveBeenCalledTimes(1);
    release(true);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("keeps the chosen destination when the default root place is a new object", () => {
    const model = app();
    const { rerender } = render(
      <AddToLibraryDialog
        app={model}
        paths={["/tmp/a.stl"]}
        defaultPlace={{ type: "root" }}
        onClose={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole("option", { name: "Terrain" }));
    expect(copyIntoLine()).toBe("Copy into: 3D Print Library / Terrain");
    rerender(
      <AddToLibraryDialog
        app={model}
        paths={["/tmp/a.stl"]}
        defaultPlace={{ type: "root" }}
        onClose={() => undefined}
      />,
    );
    expect(copyIntoLine()).toBe("Copy into: 3D Print Library / Terrain");
  });

  it("starts at the default browse location from the library", () => {
    render(
      <AddToLibraryDialog
        app={app()}
        paths={["/tmp/a.stl"]}
        defaultPlace={{ type: "folder", id: 2 }}
        onClose={() => undefined}
      />,
    );
    expect(copyIntoLine()).toBe("Copy into: 3D Print Library / Bases and Toppers / Bases");
  });

  it("handles keyboard navigation in the folder list", async () => {
    importPaths.mockResolvedValue({ importedCount: 1, importedIds: [1] });
    render(
      <AddToLibraryDialog
        app={app()}
        paths={["/tmp/a.stl"]}
        defaultPlace={{ type: "root" }}
        onClose={() => undefined}
      />,
    );
    const list = screen.getByRole("listbox", { name: "Destination folder" });
    list.focus();
    fireEvent.keyDown(list, { key: "ArrowDown" });
    fireEvent.keyDown(list, { key: "Enter" });
    expect(copyIntoLine()).toBe("Copy into: 3D Print Library / Bases and Toppers");
    fireEvent.keyDown(list, { key: "Backspace" });
    expect(copyIntoLine()).toBe("Copy into: 3D Print Library");
  });

  it("moves up only one level when Backspace is pressed on the folder list", () => {
    render(
      <AddToLibraryDialog
        app={app()}
        paths={["/tmp/a.stl"]}
        defaultPlace={{ type: "folder", id: 3 }}
        onClose={() => undefined}
      />,
    );
    const list = screen.getByRole("listbox", { name: "Destination folder" });
    expect(fireEvent.keyDown(list, { key: "Backspace" })).toBe(false);
    expect(copyIntoLine()).toBe("Copy into: 3D Print Library / Bases and Toppers / Bases");
  });

  it("keeps the destination while typing in the creator and tag fields", () => {
    const model = app();
    const { rerender } = render(
      <AddToLibraryDialog
        app={model}
        paths={["/tmp/a.stl"]}
        defaultPlace={{ type: "root" }}
        onClose={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole("option", { name: "Terrain" }));
    const creator = screen.getByPlaceholderText("Creator for all imported files");
    const tags = screen.getByPlaceholderText("Tags for all imported files");
    creator.focus();
    expect(fireEvent.keyDown(creator, { key: "Backspace" })).toBe(true);
    tags.focus();
    expect(fireEvent.keyDown(tags, { key: "Backspace" })).toBe(true);
    expect(document.activeElement).toBe(tags);
    fireEvent.change(creator, { target: { value: "New" } });
    rerender(
      <AddToLibraryDialog
        app={{ ...model, importCreator: "New" }}
        paths={["/tmp/a.stl"]}
        defaultPlace={{ type: "root" }}
        onClose={() => undefined}
      />,
    );
    expect(copyIntoLine()).toBe("Copy into: 3D Print Library / Terrain");
  });

  it("leaves the destination alone when the creator field receives arrows or Enter", () => {
    render(
      <AddToLibraryDialog
        app={app()}
        paths={["/tmp/a.stl"]}
        defaultPlace={{ type: "root" }}
        onClose={() => undefined}
      />,
    );
    const list = screen.getByRole("listbox", { name: "Destination folder" });
    fireEvent.keyDown(list, { key: "ArrowDown" });
    const creator = screen.getByPlaceholderText("Creator for all imported files");
    creator.focus();
    fireEvent.keyDown(creator, { key: "ArrowDown" });
    fireEvent.keyDown(creator, { key: "Enter" });
    expect(copyIntoLine()).toBe("Copy into: 3D Print Library");
  });

  it("steps up one folder on Backspace outside a text field", () => {
    render(
      <AddToLibraryDialog
        app={app()}
        paths={["/tmp/a.stl"]}
        defaultPlace={{ type: "folder", id: 3 }}
        onClose={() => undefined}
      />,
    );
    const up = screen.getByRole("button", { name: "Up one folder" });
    expect(fireEvent.keyDown(up, { key: "Backspace" })).toBe(false);
    expect(copyIntoLine()).toBe("Copy into: 3D Print Library / Bases and Toppers / Bases");
  });

  it("closes on Escape from the creator field", () => {
    const onClose = vi.fn();
    render(
      <AddToLibraryDialog
        app={app()}
        paths={["/tmp/a.stl"]}
        defaultPlace={{ type: "root" }}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(screen.getByPlaceholderText("Creator for all imported files"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("imports the library root when the default folder was deleted", async () => {
    importPaths.mockResolvedValue({ importedCount: 1, importedIds: [1] });
    render(
      <AddToLibraryDialog
        app={app()}
        paths={["/tmp/a.stl"]}
        defaultPlace={{ type: "folder", id: 99 }}
        onClose={() => undefined}
      />,
    );
    expect(copyIntoLine()).toBe("Copy into: 3D Print Library");
    fireEvent.click(screen.getByRole("button", { name: "Add to library" }));
    await waitFor(() => expect(importPaths).toHaveBeenCalledWith(["/tmp/a.stl"], null));
  });

  it("drops a destination that disappears while the dialog is open", async () => {
    importPaths.mockResolvedValue({ importedCount: 1, importedIds: [1] });
    const model = app();
    const { rerender } = render(
      <AddToLibraryDialog
        app={model}
        paths={["/tmp/a.stl"]}
        defaultPlace={{ type: "root" }}
        onClose={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole("option", { name: "Terrain" }));
    rerender(
      <AddToLibraryDialog
        app={{ ...model, folders: libraryTree.filter((row) => row.id !== 4) }}
        paths={["/tmp/a.stl"]}
        defaultPlace={{ type: "root" }}
        onClose={() => undefined}
      />,
    );
    expect(copyIntoLine()).toBe("Copy into: 3D Print Library");
    fireEvent.click(screen.getByRole("button", { name: "Add to library" }));
    await waitFor(() => expect(importPaths).toHaveBeenCalledWith(["/tmp/a.stl"], null));
  });

  it("keeps the folder id when that folder is renamed", async () => {
    importPaths.mockResolvedValue({ importedCount: 1, importedIds: [1] });
    const model = app();
    const { rerender } = render(
      <AddToLibraryDialog
        app={model}
        paths={["/tmp/a.stl"]}
        defaultPlace={{ type: "folder", id: 2 }}
        onClose={() => undefined}
      />,
    );
    const renamed = libraryTree.map((row) => (row.id === 2 ? { ...row, name: "Magnets" } : row));
    rerender(
      <AddToLibraryDialog
        app={{ ...model, folders: renamed }}
        paths={["/tmp/a.stl"]}
        defaultPlace={{ type: "folder", id: 2 }}
        onClose={() => undefined}
      />,
    );
    expect(copyIntoLine()).toBe("Copy into: 3D Print Library / Bases and Toppers / Magnets");
    fireEvent.click(screen.getByRole("button", { name: "Add to library" }));
    await waitFor(() => expect(importPaths).toHaveBeenCalledWith(["/tmp/a.stl"], 2));
  });

  it("imports the clicked twin when two folders share a name", async () => {
    importPaths.mockResolvedValue({ importedCount: 1, importedIds: [1] });
    const folders = [
      folder(1, null, "Bases"),
      folder(2, 1, "Oval"),
      folder(3, null, "Terrain"),
      folder(4, 3, "Oval"),
    ];
    render(
      <AddToLibraryDialog
        app={app({ folders, libraryName: "Library" })}
        paths={["/tmp/a.stl"]}
        defaultPlace={{ type: "root" }}
        onClose={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole("option", { name: "Terrain" }));
    fireEvent.click(screen.getByRole("option", { name: "Oval" }));
    fireEvent.click(screen.getByRole("button", { name: "Add to library" }));
    await waitFor(() => expect(importPaths).toHaveBeenCalledWith(["/tmp/a.stl"], 4));
  });

  it("imports null for the library root when Downloads is the default place", async () => {
    importPaths.mockResolvedValue({ importedCount: 0, importedIds: [] });
    const model = app({ runDownloadsImport: vi.fn(async (paths, folderId) => {
      await importPaths(paths, folderId);
      return true;
    }) });
    render(
      <AddToLibraryDialog
        app={model}
        paths={["/tmp/a.stl"]}
        defaultPlace={{ type: "downloads" }}
        onClose={() => undefined}
      />,
    );
    expect(copyIntoLine()).toBe("Copy into: 3D Print Library");
    expect(screen.getByRole("option", { name: "Terrain" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add to library" }));
    await waitFor(() => expect(importPaths).toHaveBeenCalledWith(["/tmp/a.stl"], null));
  });

  it("jumps to a middle ancestor on a deep path and imports that id", async () => {
    importPaths.mockResolvedValue({ importedCount: 1, importedIds: [1] });
    const deep = [
      folder(1, null, "L1"),
      folder(2, 1, "L2"),
      folder(3, 2, "L3"),
      folder(4, 3, "L4"),
      folder(5, 4, "L5"),
      folder(6, 5, "L6"),
    ];
    render(
      <AddToLibraryDialog
        app={app({ folders: deep })}
        paths={["/tmp/a.stl"]}
        defaultPlace={{ type: "folder", id: 6 }}
        onClose={() => undefined}
      />,
    );
    expect(copyIntoLine()).toBe("Copy into: 3D Print Library / L1 / L2 / L3 / L4 / L5 / L6");
    expect(screen.queryByText("…")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "L2" }));
    expect(copyIntoLine()).toBe("Copy into: 3D Print Library / L1 / L2");
    fireEvent.click(screen.getByRole("button", { name: "Add to library" }));
    await waitFor(() => expect(importPaths).toHaveBeenCalledWith(["/tmp/a.stl"], 2));
  });

  it("steps to the root instead of a deleted parent id", async () => {
    importPaths.mockResolvedValue({ importedCount: 1, importedIds: [1] });
    const full = [
      folder(1, null, "Bases and Toppers"),
      folder(2, 1, "Bases"),
      folder(3, 2, "Cobblestone"),
    ];
    const model = app({ folders: full });
    const { rerender } = render(
      <AddToLibraryDialog
        app={model}
        paths={["/tmp/a.stl"]}
        defaultPlace={{ type: "folder", id: 3 }}
        onClose={() => undefined}
      />,
    );
    rerender(
      <AddToLibraryDialog
        app={{ ...model, folders: full.filter((row) => row.id !== 2) }}
        paths={["/tmp/a.stl"]}
        defaultPlace={{ type: "folder", id: 3 }}
        onClose={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Up one folder" }));
    expect(copyIntoLine()).toBe("Copy into: 3D Print Library");
    fireEvent.click(screen.getByRole("button", { name: "Add to library" }));
    await waitFor(() => expect(importPaths).toHaveBeenCalledWith(["/tmp/a.stl"], null));
  });
});
