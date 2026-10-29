import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Settings } from "../types";
import { emptyProgress, type Actions } from "./libraryTypes";
import { useLibraryEffects } from "./useLibraryEffects";

const debugLog = vi.hoisted(() => vi.fn());

vi.mock("../debugLog", () => ({
  debugLog: (...args: unknown[]) => debugLog(...args),
}));

vi.mock("../api", () => ({
  api: {
    bootstrap: async () => ({
      settings: {
        libraryRoot: "/library",
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
        externalPrograms: [],
      },
      folders: [],
      missingCount: 0,
    }),
    dragIconPath: async () => "/icon.png",
    nextThumbnail: async () => null,
    prepareDragPaths: async () => ({ paths: [], skipped: [], reports: [] }),
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => path,
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => undefined),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn(async () => "26.10.29"),
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

const settings: Settings = {
  libraryRoot: "/library",
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
  externalPrograms: [],
};

const actions: Actions = {
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
};

describe("useLibraryEffects", () => {
  it("logs the open dialogs and returns the file-drag state", async () => {
    const { result, unmount } = renderHook(() =>
      useLibraryEffects({
        browse: { type: "root" },
        dialogOpen: false,
        folderTagTarget: null,
        fileMenu: null,
        selected: [],
        openDeleteFolderConfirm: () => undefined,
        files: [],
        runDiskOp: async () => undefined,
        setSelected: () => undefined,
        refreshLists: async () => undefined,
        refreshListsRef: { current: async () => undefined },
        thumbGeneration: { current: 0 },
        ready: false,
        settings,
        thumbNonce: 0,
        busy: "import",
        progress: { current: 2, total: 5, message: "hashing" },
        summary: { importedCount: 3 },
        namePrompt: { title: "New folder" },
        deleteConfirm: { name: "Toys" },
        missingOpen: true,
        error: "disk full",
        setSettings: () => undefined,
        setSidebarWidth: () => undefined,
        setInspectorWidth: () => undefined,
        setInspectorPinned: () => undefined,
        setSidebarPinned: () => undefined,
        setPreviewHeight: () => undefined,
        setDetailsColumns: () => undefined,
        setFolders: () => undefined,
        setMissingCount: () => undefined,
        setTheme: () => undefined,
        setReady: () => undefined,
        setError: () => undefined,
        dragIconRef: { current: null },
        runImportRef: { current: async () => undefined },
        setProgress: () => undefined,
        setThumbNonce: () => undefined,
        query: "",
        creator: "",
        selectedTagIds: [],
        selectedTypeIds: [],
        tagMatch: "any",
        sort: { field: "name", direction: "asc" },
        setPreviewIconsEnabled: () => undefined,
        aboutOpen: false,
        setAboutVersion: () => undefined,
        setAboutVersionFailed: () => undefined,
        creatorTarget: null,
        setCreatorFileCount: () => undefined,
        includeSubfolders: true,
        setFileMenu: () => undefined,
        setFolderTagFileCount: () => undefined,
        diskProgress: { current: emptyProgress() },
        setDiskDialog: () => undefined,
        toastTimer: { current: null },
        actions: { current: actions },
        runImport: async () => undefined,
        setAboutOpen: () => undefined,
        setTagColorOpen: () => undefined,
        setExternalProgramsOpen: () => undefined,
        dragRef: { current: null },
        filesRef: { current: [] },
        tryStartRef: { current: () => undefined },
        prefetchRef: { current: () => undefined },
        dragPrepCache: { current: null },
        showToast: () => undefined,
        setDragFailure: () => undefined,
      }),
    );

    await waitFor(() => {
      expect(debugLog).toHaveBeenCalledWith("dialogs", {
        busy: "import",
        progress: "2/5 hashing",
        summary: 3,
        namePrompt: "New folder",
        deleteConfirm: "Toys",
        missingOpen: true,
        error: "disk full",
      });
    });
    expect(result.current.dropTarget).toBeNull();
    expect(typeof result.current.onPointerDown).toBe("function");
    unmount();
  });
});
