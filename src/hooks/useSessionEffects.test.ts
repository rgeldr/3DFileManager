import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Actions } from "./libraryTypes";
import { useSessionEffects } from "./useSessionEffects";

const bootstrap = vi.fn();
const setThemeApi = vi.fn();
const listen = vi.fn(async (..._args: unknown[]) => () => undefined);
const getVersion = vi.fn();
const getCurrentWebview = vi.fn((..._args: unknown[]) => ({
  setFocus: vi.fn(async () => undefined),
  onDragDropEvent: vi.fn(async () => () => undefined),
}));
const open = vi.fn();
const dragIconPath = vi.fn(async (..._args: unknown[]) => "/icon.png");

vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => listen(...args),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: (...args: unknown[]) => getVersion(...args),
}));

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: (...args: unknown[]) => getCurrentWebview(...args),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => open(...args),
}));

const countFilesForScope = vi.fn();
const addTagsUnderFolder = vi.fn();
const restoreLibraryBackup = vi.fn();

vi.mock("../api", () => ({
  api: {
    bootstrap: (...args: unknown[]) => bootstrap(...args),
    setTheme: (...args: unknown[]) => setThemeApi(...args),
    dragIconPath: (...args: unknown[]) => dragIconPath(...args),
    clearThumbnailCache: vi.fn(),
    countFilesForScope: (...args: unknown[]) => countFilesForScope(...args),
    addTagsUnderFolder: (...args: unknown[]) => addTagsUnderFolder(...args),
    restoreLibraryBackup: (...args: unknown[]) => restoreLibraryBackup(...args),
  },
}));

vi.mock("../debugLog", () => ({
  debugLog: () => undefined,
}));

afterEach(() => {
  bootstrap.mockReset();
  setThemeApi.mockReset();
  listen.mockClear();
  getVersion.mockReset();
  open.mockReset();
  dragIconPath.mockReset();
  countFilesForScope.mockReset();
  addTagsUnderFolder.mockReset();
  restoreLibraryBackup.mockReset();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

function sessionBag(overrides: Record<string, unknown> = {}) {
  const setTheme = vi.fn();
  const setAboutOpen = vi.fn();
  const setAboutVersion = vi.fn();
  const setAboutVersionFailed = vi.fn();
  const setReady = vi.fn();
  const setError = vi.fn();
  const setFileMenu = vi.fn();
  const setSettings = vi.fn();
  const setSidebarWidth = vi.fn();
  const setInspectorWidth = vi.fn();
  const setInspectorPinned = vi.fn();
  const setSidebarPinned = vi.fn();
  const setPreviewHeight = vi.fn();
  const setDetailsColumns = vi.fn();
  const setFolders = vi.fn();
  const setMissingCount = vi.fn();
  const setProgress = vi.fn();
  const setThumbNonce = vi.fn();
  const setPreviewIconsEnabled = vi.fn();
  const setCreatorFileCount = vi.fn();
  const setFolderTagFileCount = vi.fn();
  const setDiskDialog = vi.fn();
  const setTagColorOpen = vi.fn();
  const setExternalProgramsOpen = vi.fn();
  const refreshLists = vi.fn(async () => undefined);
  const runDiskOp = vi.fn(async () => undefined);
  const runImport = vi.fn(async () => undefined);
  const actions: { current: Actions } = {
    current: {
      importFolder: () => undefined,
      importArchive: () => undefined,
      moveLibrary: () => undefined,
      backupLibrary: () => undefined,
      restoreLibrary: () => undefined,
      rescan: () => undefined,
      clearThumbs: () => undefined,
      setTheme: () => undefined,
      setGrid: () => undefined,
      showAbout: () => undefined,
      openTagColors: () => undefined,
      openExternalPrograms: () => undefined,
    },
  };
  return {
    dialogOpen: false,
    busy: null,
    progress: null,
    summary: null,
    namePrompt: null,
    deleteConfirm: null,
    missingOpen: false,
    error: null,
    ready: false,
    settings: null,
    setSettings,
    setSidebarWidth,
    setInspectorWidth,
    setInspectorPinned,
    setSidebarPinned,
    setPreviewHeight,
    setDetailsColumns,
    setFolders,
    setMissingCount,
    setTheme,
    refreshLists,
    setReady,
    setError,
    dragIconRef: { current: null as string | null },
    runImportRef: { current: async (_paths: string[]) => undefined },
    setProgress,
    setThumbNonce,
    browse: { type: "root" as const },
    query: "",
    creator: "",
    selectedTagIds: [] as number[],
    selectedTypeIds: [] as string[],
    tagMatch: "any" as const,
    sort: { field: "name" as const, direction: "asc" as const },
    setPreviewIconsEnabled,
    aboutOpen: false,
    setAboutVersion,
    setAboutVersionFailed,
    creatorTarget: null as null | { folderId: number | null; name: string; fileIds?: number[] },
    setCreatorFileCount,
    includeSubfolders: true,
    fileMenu: null as null | { x: number; y: number; fileId: number },
    setFileMenu,
    folderTagTarget: null as null | { folderId: number | null; name: string; fileIds?: number[] },
    setFolderTagFileCount,
    diskProgress: { current: { current: 0, total: 0, name: "", bytesDone: 0, bytesTotal: 0, cancellable: false } },
    setDiskDialog,
    toastTimer: { current: null as number | null },
    actions,
    runDiskOp,
    runImport,
    setAboutOpen,
    setTagColorOpen,
    setExternalProgramsOpen,
    ...overrides,
  };
}

describe("useSessionEffects", () => {
  it("wires actions.current.setTheme and showAbout", async () => {
    bootstrap.mockResolvedValue({
      settings: {
        libraryRoot: null,
        theme: "dark",
        gridSize: "large",
        sidebarWidth: 240,
        inspectorWidth: 320,
        previewHeight: 240,
        thumbRetry: 0,
        inspectorPinned: true,
        sidebarPinned: true,
        searchScope: "library",
        detailsColumns: { name: 240, size: 96, modified: 176, added: 176, creator: 128 },
      },
      folders: [],
      missingCount: 0,
    });
    const state = sessionBag();
    renderHook(() => useSessionEffects(state as Parameters<typeof useSessionEffects>[0]));

    await waitFor(() => expect(state.actions.current.setTheme).not.toBeUndefined());
    act(() => {
      state.actions.current.setTheme("light");
      state.actions.current.showAbout();
      state.actions.current.openExternalPrograms();
    });
    expect(state.setTheme).toHaveBeenCalledWith("light");
    expect(setThemeApi).toHaveBeenCalledWith("light");
    expect(state.setAboutOpen).toHaveBeenCalledWith(true);
    expect(state.setAboutVersion).toHaveBeenCalledWith(null);
    expect(state.setExternalProgramsOpen).toHaveBeenCalledWith(true);
  });

  it("marks ready after a bootstrap error", async () => {
    bootstrap.mockRejectedValue(new Error("boot failed"));
    const state = sessionBag();
    renderHook(() => useSessionEffects(state as Parameters<typeof useSessionEffects>[0]));
    await waitFor(() => expect(state.setReady).toHaveBeenCalledWith(true));
    expect(state.setError).toHaveBeenCalledWith(expect.stringMatching(/boot failed/));
  });

  it("closes the file menu on Escape", async () => {
    bootstrap.mockResolvedValue({
      settings: {
        libraryRoot: null,
        theme: "dark",
        gridSize: "large",
        sidebarWidth: 240,
        inspectorWidth: 320,
        previewHeight: 240,
        thumbRetry: 0,
        inspectorPinned: true,
        sidebarPinned: true,
        searchScope: "library",
        detailsColumns: { name: 240, size: 96, modified: 176, added: 176, creator: 128 },
      },
      folders: [],
      missingCount: 0,
    });
    const setFileMenu = vi.fn();
    const state = sessionBag({
      fileMenu: { x: 10, y: 20, fileId: 4 },
      setFileMenu,
    });
    const { rerender } = renderHook(
      (props) => useSessionEffects(props as Parameters<typeof useSessionEffects>[0]),
      { initialProps: state },
    );
    await waitFor(() => expect(bootstrap).toHaveBeenCalled());
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(setFileMenu).toHaveBeenCalledWith(null);
    rerender({ ...state, fileMenu: null });
  });

  it("closes the file menu on an outside pointer down", async () => {
    bootstrap.mockResolvedValue({
      settings: {
        libraryRoot: null,
        theme: "dark",
        gridSize: "large",
        sidebarWidth: 240,
        inspectorWidth: 320,
        previewHeight: 240,
        thumbRetry: 0,
        inspectorPinned: true,
        sidebarPinned: true,
        searchScope: "library",
        detailsColumns: { name: 240, size: 96, modified: 176, added: 176, creator: 128 },
      },
      folders: [],
      missingCount: 0,
    });
    const setFileMenu = vi.fn();
    const menu = document.createElement("div");
    menu.className = "file-context-menu";
    document.body.append(menu);
    const state = sessionBag({
      fileMenu: { x: 0, y: 0, fileId: 2 },
      setFileMenu,
    });
    renderHook(() => useSessionEffects(state as Parameters<typeof useSessionEffects>[0]));
    await waitFor(() => expect(bootstrap).toHaveBeenCalled());
    act(() => {
      document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    expect(setFileMenu).toHaveBeenCalledWith(null);
  });

  it("loads creator and folder-tag file counts", async () => {
    bootstrap.mockResolvedValue({
      settings: {
        libraryRoot: "/lib",
        theme: "dark",
        gridSize: "large",
        sidebarWidth: 240,
        inspectorWidth: 320,
        previewHeight: 240,
        thumbRetry: 0,
        inspectorPinned: true,
        sidebarPinned: true,
        searchScope: "library",
        detailsColumns: { name: 240, size: 96, modified: 176, added: 176, creator: 128 },
      },
      folders: [],
      missingCount: 0,
    });
    countFilesForScope.mockResolvedValue(12);
    addTagsUnderFolder.mockResolvedValue(4);
    const setCreatorFileCount = vi.fn();
    const setFolderTagFileCount = vi.fn();
    const state = sessionBag({
      ready: true,
      creatorTarget: { folderId: 5, name: "Minis" },
      setCreatorFileCount,
      folderTagTarget: { folderId: 6, name: "Terrain" },
      setFolderTagFileCount,
    });
    const { rerender } = renderHook(
      (props) => useSessionEffects(props as Parameters<typeof useSessionEffects>[0]),
      { initialProps: state },
    );
    await waitFor(() => expect(countFilesForScope).toHaveBeenCalledWith(5, true));
    await waitFor(() => expect(addTagsUnderFolder).toHaveBeenCalledWith(6, []));
    expect(setCreatorFileCount).toHaveBeenCalledWith(12);
    expect(setFolderTagFileCount).toHaveBeenCalledWith(4);
    rerender({
      ...state,
      creatorTarget: { folderId: null, name: "2 files", fileIds: [1, 2] },
      folderTagTarget: { folderId: null, name: "tag", fileIds: [9] },
    });
    expect(setCreatorFileCount).toHaveBeenCalledWith(2);
    expect(setFolderTagFileCount).toHaveBeenCalledWith(1);
    rerender({ ...state, creatorTarget: null, folderTagTarget: null });
    expect(setCreatorFileCount).toHaveBeenCalledWith(null);
    expect(setFolderTagFileCount).toHaveBeenCalledWith(null);
  });

  it("clamps pane widths on window resize", async () => {
    bootstrap.mockResolvedValue({
      settings: {
        libraryRoot: null,
        theme: "dark",
        gridSize: "large",
        sidebarWidth: 240,
        inspectorWidth: 320,
        previewHeight: 240,
        thumbRetry: 0,
        inspectorPinned: true,
        sidebarPinned: true,
        searchScope: "library",
        detailsColumns: { name: 240, size: 96, modified: 176, added: 176, creator: 128 },
      },
      folders: [],
      missingCount: 0,
    });
    const setSidebarWidth = vi.fn();
    const setInspectorWidth = vi.fn();
    const state = sessionBag({ setSidebarWidth, setInspectorWidth });
    renderHook(() => useSessionEffects(state as Parameters<typeof useSessionEffects>[0]));
    await waitFor(() => expect(bootstrap).toHaveBeenCalled());
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(setSidebarWidth).toHaveBeenCalled();
    expect(setInspectorWidth).toHaveBeenCalled();
  });

  it("restores a library backup into a provided destination", async () => {
    bootstrap.mockResolvedValue({
      settings: {
        libraryRoot: "/lib",
        theme: "dark",
        gridSize: "large",
        sidebarWidth: 240,
        inspectorWidth: 320,
        previewHeight: 240,
        thumbRetry: 0,
        inspectorPinned: true,
        sidebarPinned: true,
        searchScope: "library",
        detailsColumns: { name: 240, size: 96, modified: 176, added: 176, creator: 128 },
      },
      folders: [],
      missingCount: 0,
    });
    open.mockResolvedValueOnce("/backup/dir");
    restoreLibraryBackup.mockResolvedValue({ cancelled: false });
    const runDiskOp = vi.fn(async (opts: { run: () => Promise<{ cancelled: boolean }> }) => {
      await opts.run();
    });
    const state = sessionBag({ runDiskOp });
    renderHook(() => useSessionEffects(state as Parameters<typeof useSessionEffects>[0]));
    await waitFor(() => expect(bootstrap).toHaveBeenCalled());
    act(() => {
      state.actions.current.restoreLibrary("/dest/lib");
    });
    await waitFor(() => expect(runDiskOp).toHaveBeenCalled());
    expect(restoreLibraryBackup).toHaveBeenCalledWith("/backup/dir", "/dest/lib");
  });
});
