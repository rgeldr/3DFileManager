import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    fireEvent.click(screen.getByRole("button", { name: "Add to library" }));
    await waitFor(() =>
      expect(importPaths).toHaveBeenCalledWith(["C:\\Downloads\\a.stl", "C:\\Downloads\\pack.zip"], 2),
    );
    expect(model.setImportCreator).not.toHaveBeenCalled();
  });

  it("offers comma tag suggestions like the summary dialog", () => {
    render(
      <AddToLibraryDialog
        app={app({ importTagText: "PLA, ben", importTags: [] })}
        paths={["/tmp/a.stl"]}
        defaultPlace={{ type: "root" }}
        onClose={() => undefined}
      />,
    );
    const options = document.querySelectorAll("#add-library-tags option");
    expect([...options].map((option) => option.getAttribute("value"))).toEqual(["PLA, benchy"]);
  });
});
