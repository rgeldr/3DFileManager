import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryModel } from "../../hooks/useLibrary";
import { AddToLibraryDialog, folderOptions } from "./AddToLibraryDialog";

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

function app(overrides: Record<string, unknown> = {}): LibraryModel {
  return {
    folders: [{ id: 2, parentId: null, name: "Models", relpath: "Models", sortOrder: 0 }],
    libraryName: "Library",
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
    }),
    ...overrides,
  } as unknown as LibraryModel;
}

describe("AddToLibraryDialog", () => {
  it("calls importPaths with every selected path and the chosen folder", async () => {
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
    expect((screen.getByPlaceholderText("Creator for all imported files") as HTMLInputElement).value).toBe("Ada");
    expect(screen.getByRole("button", { name: /PLA/ })).toBeTruthy();
    expect((screen.getByPlaceholderText("Tags for all imported files") as HTMLInputElement).value).toBe("benchy");
    fireEvent.click(screen.getByRole("button", { name: "Add to library" }));
    await waitFor(() =>
      expect(importPaths).toHaveBeenCalledWith(["C:\\Downloads\\a.stl", "C:\\Downloads\\pack.zip"], 2),
    );
    expect(model.setImportCreator).not.toHaveBeenCalled();
    expect(model.setImportTags).not.toHaveBeenCalled();
    expect(model.setImportTagText).not.toHaveBeenCalled();
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
    fireEvent.change(screen.getByLabelText("Destination folder"), { target: { value: "2" } });
    rerender(
      <AddToLibraryDialog
        app={model}
        paths={["/tmp/a.stl"]}
        defaultPlace={{ type: "root" }}
        onClose={() => undefined}
      />,
    );
    expect((screen.getByLabelText("Destination folder") as HTMLSelectElement).value).toBe("2");
  });

  it("sorts destination folders and shows nested paths with slashes", () => {
    expect(folderOptions(
      [
        { id: 2, parentId: null, name: "Zeta", relpath: "zeta", sortOrder: 0 },
        { id: 3, parentId: 2, name: "Boats", relpath: "prints\\boats", sortOrder: 0 },
      ],
      "Library",
    )).toEqual([
      { id: "root", label: "Library" },
      { id: "3", label: "prints/boats" },
      { id: "2", label: "zeta" },
    ]);
  });
});
