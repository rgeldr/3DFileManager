import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LIBRARY_SEARCH_LIMIT } from "../lib/tagFilter";
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
  prepareDragPaths: vi.fn(async () => ({ paths: [], skipped: [], reports: [] })),
  countFilesForScope: vi.fn(),
  addTagsUnderFolder: vi.fn(),
  listDownloads: vi.fn(),
  setDownloadsFolder: vi.fn(),
};

vi.mock("../api", () => ({
  api: new Proxy(
    {},
    {
      get(_target, prop: string) {
        return (...args: unknown[]) => {
          const fn = (api as Record<string, (...args: unknown[]) => unknown>)[prop];
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
  externalPrograms: [],
  downloadsFolder: null,
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
  vi.useRealTimers();
  for (const value of Object.values(api)) value.mockReset();
  vi.restoreAllMocks();
});

describe("useLibrary", () => {
  it("counts the external programs dialog as an open dialog", async () => {
    api.bootstrap.mockResolvedValue({ settings, folders: [], missingCount: 0 });
    mockCatalog();
    const { result } = renderHook(() => useLibrary(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.externalProgramsOpen).toBe(false);
    expect(result.current.dialogOpen).toBe(false);
    act(() => {
      result.current.setExternalProgramsOpen(true);
    });
    expect(result.current.dialogOpen).toBe(true);
  });

  it("skips a passive refresh when the list key is unchanged", async () => {
    api.bootstrap.mockResolvedValue({ settings, folders: [], missingCount: 0 });
    mockCatalog();
    const { result } = renderHook(() => useLibrary(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    await waitFor(() => expect(api.listFiles).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
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

  it("dedupes in-flight refreshLists calls with the same key", async () => {
    api.bootstrap.mockResolvedValue({ settings, folders: [], missingCount: 0 });
    mockCatalog();
    const { result } = renderHook(() => useLibrary(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    await waitFor(() => expect(api.listFiles).toHaveBeenCalled());
    let resolve!: (rows: unknown[]) => void;
    api.listFiles.mockImplementation(
      () =>
        new Promise((res) => {
          resolve = res;
        }),
    );
    const start = api.listFiles.mock.calls.length;
    let second!: Promise<void>;
    await act(async () => {
      void result.current.refreshLists();
      second = result.current.refreshLists();
    });
    resolve([]);
    await act(async () => {
      await second;
    });
    expect(api.listFiles.mock.calls.length).toBe(start + 1);
  });

  it("drops stale refreshLists results", async () => {
    api.bootstrap.mockResolvedValue({ settings, folders: [], missingCount: 0 });
    mockCatalog();
    const row = (id: number, name: string) => ({
      id,
      originalName: name,
      sortName: name,
      storedRelpath: `${name}.stl`,
      ext: "stl",
      sizeBytes: 1,
      sha256: "x",
      folderId: null,
      creator: "",
      notes: "",
      sourceArchive: null,
      importedAt: 1,
      mtime: 1,
      thumbStatus: "ok",
      missing: false,
      tags: [],
      absolutePath: `/library/${name}.stl`,
      thumbPath: null,
    });
    const { result } = renderHook(() => useLibrary(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    let resolveA!: (rows: unknown[]) => void;
    let resolveB!: (rows: unknown[]) => void;
    api.listFiles
      .mockImplementationOnce(
        () =>
          new Promise((res) => {
            resolveA = res;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((res) => {
            resolveB = res;
          }),
      );
    await act(async () => {
      void result.current.refreshLists();
      void result.current.refreshLists(undefined, "needle");
    });
    resolveB([row(2, "new")]);
    await waitFor(() => expect(result.current.files[0]?.id).toBe(2));
    resolveA([row(1, "old")]);
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.files[0]?.id).toBe(2);
  });

  it("navigates folder history with Alt+ArrowLeft", async () => {
    const folders = [
      { id: 2, parentId: null, name: "A", relpath: "A", sortOrder: 0 },
      { id: 3, parentId: null, name: "B", relpath: "B", sortOrder: 1 },
    ];
    api.bootstrap.mockResolvedValue({ settings, folders, missingCount: 0 });
    mockCatalog();
    const { result } = renderHook(() => useLibrary(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => {
      result.current.setBrowse({ type: "folder", id: 2 });
      result.current.setBrowse({ type: "folder", id: 3 });
    });
    expect(result.current.browse).toEqual({ type: "folder", id: 3 });
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", altKey: true }));
    });
    expect(result.current.browse).toEqual({ type: "folder", id: 2 });
  });

  it("truncates library-wide search results", async () => {
    api.bootstrap.mockResolvedValue({ settings, folders: [], missingCount: 0 });
    api.listCreators.mockResolvedValue([]);
    api.listTagCounts.mockResolvedValue([]);
    api.listTypeCounts.mockResolvedValue([]);
    const row = (id: number) => ({
      id,
      originalName: `f${id}`,
      sortName: `f${id}`,
      storedRelpath: `f${id}.stl`,
      ext: "stl",
      sizeBytes: 1,
      sha256: "x",
      folderId: null,
      creator: "",
      notes: "",
      sourceArchive: null,
      importedAt: 1,
      mtime: 1,
      thumbStatus: "ok",
      missing: false,
      tags: [],
      absolutePath: `/library/f${id}.stl`,
      thumbPath: null,
    });
    api.listFiles.mockResolvedValue(Array.from({ length: LIBRARY_SEARCH_LIMIT + 1 }, (_, i) => row(i + 1)));
    api.listCreators.mockResolvedValue([]);
    api.listTagCounts.mockResolvedValue([]);
    api.listTypeCounts.mockResolvedValue([]);
    const { result } = renderHook(() => useLibrary(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => {
      result.current.setQuery("needle");
    });
    await waitFor(() => expect(result.current.files.length).toBe(LIBRARY_SEARCH_LIMIT));
    expect(result.current.listTruncated).toBe(true);
  });

  it("skips missing folders when navigating history back", async () => {
    const folders = [
      { id: 2, parentId: null, name: "A", relpath: "A", sortOrder: 0 },
      { id: 3, parentId: null, name: "B", relpath: "B", sortOrder: 1 },
    ];
    api.bootstrap.mockResolvedValue({ settings, folders, missingCount: 0 });
    mockCatalog();
    const { result } = renderHook(() => useLibrary(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => {
      result.current.setBrowse({ type: "folder", id: 2 });
      result.current.setBrowse({ type: "folder", id: 3 });
      result.current.setBrowse({ type: "folder", id: 99 });
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", altKey: true }));
    });
    expect(result.current.browse).toEqual({ type: "folder", id: 3 });
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", altKey: true }));
    });
    expect(result.current.browse).toEqual({ type: "folder", id: 2 });
  });

  it("finishes a fast disk op without showing a dialog or toast", async () => {
    api.bootstrap.mockResolvedValue({ settings, folders: [], missingCount: 0 });
    mockCatalog();
    const { result } = renderHook(() => useLibrary(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => {
      await result.current.runDiskOp({
        title: "Quick",
        cancellable: false,
        success: "Done",
        cancelled: "Nope",
        run: async () => ({ cancelled: false }),
      });
    });
    expect(result.current.diskDialog).toBeNull();
    expect(result.current.toast).toBeNull();
  });

  it("shows disk progress and toasts for slow operations", async () => {
    api.bootstrap.mockResolvedValue({ settings, folders: [], missingCount: 0 });
    mockCatalog();
    const { result } = renderHook(() => useLibrary(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    vi.useFakeTimers();
    let release!: () => void;
    const gate = new Promise<{ cancelled: boolean }>((resolve) => {
      release = () => resolve({ cancelled: true });
    });
    await act(async () => {
      void result.current.runDiskOp({
        title: "Slow job",
        cancellable: true,
        success: "Finished",
        cancelled: "Stopped",
        run: () => gate,
      });
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(result.current.diskDialog?.title).toBe("Slow job");
    await act(async () => {
      release();
      await Promise.resolve();
    });
    expect(result.current.diskDialog).toBeNull();
    expect(result.current.toast).toBe("Stopped");
    vi.useRealTimers();
  });

  it("records errors from runDiskOp and still refreshes", async () => {
    api.bootstrap.mockResolvedValue({ settings, folders: [], missingCount: 0 });
    mockCatalog();
    const { result } = renderHook(() => useLibrary(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    const callsBefore = api.listFiles.mock.calls.length;
    await act(async () => {
      await result.current.runDiskOp({
        title: "Fail",
        cancellable: false,
        success: "ok",
        cancelled: "no",
        run: async () => {
          throw new Error("disk blew up");
        },
      });
    });
    expect(result.current.error).toMatch(/disk blew up/);
    expect(result.current.diskDialog).toBeNull();
    expect(api.listFiles.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it("opens Downloads without a catalog query and clears both selections", async () => {
    api.bootstrap.mockResolvedValue({ settings, folders: [], missingCount: 0 });
    mockCatalog();
    api.listDownloads.mockResolvedValue({
      status: "ok",
      rows: [
        {
          name: "boat.stl",
          relativeDir: "prints",
          ext: "stl",
          sizeBytes: 4,
          mtime: 1,
          absolutePath: "/downloads/prints/boat.stl",
        },
      ],
      truncated: false,
    });
    const { result } = renderHook(() => useLibrary(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.browse).toEqual({ type: "root" });
    act(() => {
      result.current.setSelected([7]);
    });
    api.listFiles.mockClear();
    api.setGridSize.mockClear();
    act(() => {
      result.current.setBrowse({ type: "downloads" });
    });
    await waitFor(() => expect(result.current.downloadsList.status).toBe("ok"));
    expect(result.current.selected).toEqual([]);
    expect(result.current.browse).toEqual({ type: "downloads" });
    expect(api.listFiles).not.toHaveBeenCalled();
    expect(api.setGridSize).not.toHaveBeenCalled();
    expect(result.current.settings?.gridSize).toBe("large");
    act(() => {
      result.current.setDownloadsSelected(["/downloads/prints/boat.stl"]);
    });
    act(() => {
      result.current.setBrowse({ type: "root" });
    });
    expect(result.current.downloadsSelected).toEqual([]);
  });
});
