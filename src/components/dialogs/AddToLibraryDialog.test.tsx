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
    fireEvent.click(screen.getByRole("button", { name: "Open Bases and Toppers" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Open Terrain" }));
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

  it("keeps the destination while typing in the creator field", () => {
    render(
      <AddToLibraryDialog
        app={app()}
        paths={["/tmp/a.stl"]}
        defaultPlace={{ type: "root" }}
        onClose={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open Terrain" }));
    fireEvent.change(screen.getByPlaceholderText("Creator for all imported files"), { target: { value: "New" } });
    expect(copyIntoLine()).toBe("Copy into: 3D Print Library / Terrain");
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <AddToLibraryDialog
        app={app()}
        paths={["/tmp/a.stl"]}
        defaultPlace={{ type: "root" }}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
