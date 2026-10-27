import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSessionEffects } from "./useSessionEffects";

const bootstrap = vi.fn();
const setThemeApi = vi.fn();
const listen = vi.fn(async () => () => undefined);
const getVersion = vi.fn();
const getCurrentWebview = vi.fn(() => ({
  setFocus: vi.fn(async () => undefined),
  onDragDropEvent: vi.fn(async () => () => undefined),
}));
const open = vi.fn();
const dragIconPath = vi.fn(async () => "/icon.png");

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

vi.mock("../api", () => ({
  api: {
    bootstrap: (...args: unknown[]) => bootstrap(...args),
    setTheme: (...args: unknown[]) => setThemeApi(...args),
    dragIconPath: (...args: unknown[]) => dragIconPath(...args),
    clearThumbnailCache: vi.fn(),
    countFilesForScope: vi.fn(),
    addTagsUnderFolder: vi.fn(),
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
  const refreshLists = vi.fn(async () => undefined);
  const runDiskOp = vi.fn(async () => undefined);
  const runImport = vi.fn(async () => undefined);
  const actions = {
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
    creatorTarget: null,
    setCreatorFileCount,
    includeSubfolders: true,
    fileMenu: null as null | { x: number; y: number; fileId: number },
    setFileMenu,
    folderTagTarget: null,
    setFolderTagFileCount,
    diskProgress: { current: { current: 0, total: 0, name: "", bytesDone: 0, bytesTotal: 0, cancellable: false } },
    setDiskDialog,
    toastTimer: { current: null as number | null },
    actions,
    runDiskOp,
    runImport,
    setAboutOpen,
    setTagColorOpen,
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
    });
    expect(state.setTheme).toHaveBeenCalledWith("light");
    expect(setThemeApi).toHaveBeenCalledWith("light");
    expect(state.setAboutOpen).toHaveBeenCalledWith(true);
    expect(state.setAboutVersion).toHaveBeenCalledWith(null);
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
});
