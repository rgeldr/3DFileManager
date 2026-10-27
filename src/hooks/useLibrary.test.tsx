import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../theme/ThemeProvider";
import { useLibrary } from "./useLibrary";

const api = {
  bootstrap: vi.fn(),
  listFiles: vi.fn(),
  listCreators: vi.fn(),
  listTagCounts: vi.fn(),
  listTypeCounts: vi.fn(),
  importPaths: vi.fn(),
  setTheme: vi.fn(),
  setGridSize: vi.fn(),
  dragIconPath: vi.fn(async () => "/icon.png"),
  clearThumbnailCache: vi.fn(),
  createFolder: vi.fn(),
  renameFolder: vi.fn(),
  renameFile: vi.fn(),
  deleteFolder: vi.fn(),
  moveFiles: vi.fn(),
  moveFolder: vi.fn(),
  moveLibraryRoot: vi.fn(),
  exportLibraryBackup: vi.fn(),
  restoreLibraryBackup: vi.fn(),
  rescanLibrary: vi.fn(),
  rescanFolder: vi.fn(),
  prepareDragPaths: vi.fn(),
  countFilesForScope: vi.fn(),
  addTagsUnderFolder: vi.fn(),
};

vi.mock("../api", () => ({
  api: new Proxy(
    {},
    {
      get(_target, prop: string) {
        return (...args: unknown[]) => {
          const fn = (api as Record<string, ReturnType<typeof vi.fn>>)[prop];
          if (!fn) return Promise.resolve(undefined);
          return fn(...args);
        };
      },
    },
  ),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => undefined),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn(async () => "1.0.0"),
}));

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({
    setFocus: vi.fn(async () => undefined),
    onDragDropEvent: vi.fn(async () => () => undefined),
  }),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("@crabnebula/tauri-plugin-drag", () => ({
  startDrag: vi.fn(),
}));

vi.mock("../debugLog", () => ({
  debugLog: () => undefined,
}));

const settings = {
  libraryRoot: "/library",
  theme: "dark" as const,
  gridSize: "large" as const,
  sidebarWidth: 240,
  inspectorWidth: 320,
  previewHeight: 240,
  thumbRetry: 0,
  inspectorPinned: true,
  sidebarPinned: true,
  searchScope: "library" as const,
  detailsColumns: { name: 240, size: 96, modified: 176, added: 176, creator: 128 },
};

function wrapper({ children }: { children: ReactNode }) {
  return <ThemeProvider initial="dark">{children}</ThemeProvider>;
}

function mockCatalog() {
  api.listFiles.mockResolvedValue([]);
  api.listCreators.mockResolvedValue([]);
  api.listTagCounts.mockResolvedValue([]);
  api.listTypeCounts.mockResolvedValue([]);
}

afterEach(() => {
  for (const value of Object.values(api)) value.mockReset();
  vi.restoreAllMocks();
});

describe("useLibrary", () => {
  it("skips a passive refresh when the list key is unchanged", async () => {
    api.bootstrap.mockResolvedValue({ settings, folders: [], missingCount: 0 });
    mockCatalog();
    const { result } = renderHook(() => useLibrary(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    const calls = api.listFiles.mock.calls.length;
    await act(async () => {
      await result.current.refreshLists(undefined, undefined, undefined, undefined, "passive");
    });
    expect(api.listFiles.mock.calls.length).toBe(calls);
  });

  it("rejects a second runDiskOp while one is busy", async () => {
    api.bootstrap.mockResolvedValue({ settings, folders: [], missingCount: 0 });
    mockCatalog();
    let release!: () => void;
    const gate = new Promise<{ cancelled: boolean }>((resolve) => {
      release = () => resolve({ cancelled: false });
    });
    const { result } = renderHook(() => useLibrary(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));

    let firstDone = false;
    act(() => {
      void result.current
        .runDiskOp({
          title: "Busy...",
          cancellable: false,
          success: "ok",
          cancelled: "no",
          run: () => gate,
        })
        .then(() => {
          firstDone = true;
        });
    });
    await act(async () => {
      await result.current.runDiskOp({
        title: "Second...",
        cancellable: false,
        success: "ok",
        cancelled: "no",
        run: async () => ({ cancelled: false }),
      });
    });
    expect(result.current.error).toMatch(/already running/);
    await act(async () => {
      release();
    });
    await waitFor(() => expect(firstDone).toBe(true));
  });

  it("reloads the tree after a successful import", async () => {
    api.bootstrap.mockResolvedValue({ settings, folders: [], missingCount: 0 });
    mockCatalog();
    api.importPaths.mockResolvedValue({
      importedCount: 1,
      importedIds: [7],
      duplicateCount: 0,
      unsupportedCount: 0,
      failed: [],
      recycleCount: 0,
      leftInPlace: 0,
      cancelled: false,
      pendingHashCount: 0,
    });
    const { result } = renderHook(() => useLibrary(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    api.bootstrap.mockResolvedValue({
      settings,
      folders: [{ id: 1, parentId: null, name: "FromZip", relpath: "FromZip", sortOrder: 0 }],
      missingCount: 0,
    });

    await act(async () => {
      await result.current.runImport(["/tmp/pack.zip"]);
    });

    expect(api.importPaths).toHaveBeenCalled();
    expect(result.current.folders.some((folder) => folder.name === "FromZip")).toBe(true);
    expect(result.current.summary?.importedIds).toEqual([7]);
  });

  it("clears filters when opening the containing folder", async () => {
    const folders = [{ id: 2, parentId: null, name: "Bases", relpath: "Bases", sortOrder: 0 }];
    api.bootstrap.mockResolvedValue({ settings, folders, missingCount: 0 });
    mockCatalog();
    api.listFiles.mockResolvedValue([
      {
        id: 5,
        originalName: "base.stl",
        sortName: "base",
        storedRelpath: "Bases/base.stl",
        ext: "stl",
        sizeBytes: 1,
        sha256: "x",
        folderId: 2,
        creator: "",
        notes: "",
        sourceArchive: null,
        importedAt: 1,
        mtime: 1,
        thumbStatus: "ok",
        missing: false,
        tags: [],
        absolutePath: "/library/Bases/base.stl",
        thumbPath: null,
      },
    ]);
    const { result } = renderHook(() => useLibrary(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    await waitFor(() => expect(result.current.files.length).toBe(1));

    act(() => {
      result.current.setQuery("needle");
      result.current.setCreator("Ada");
      result.current.setSelectedTagIds([9]);
      result.current.setSelectedTypeIds(["stl"]);
    });
    act(() => {
      result.current.openContainingFolder(5);
    });

    expect(result.current.query).toBe("");
    expect(result.current.creator).toBe("");
    expect(result.current.selectedTagIds).toEqual([]);
    expect(result.current.selectedTypeIds).toEqual([]);
    expect(result.current.browse).toEqual({ type: "folder", id: 2 });
    expect(result.current.selected).toEqual([5]);
  });
});
