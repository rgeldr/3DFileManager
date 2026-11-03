import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLibraryChanged } from "./useLibraryChanged";

const listen = vi.fn(async (..._args: unknown[]) => () => undefined);

vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => listen(...args),
}));

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => ({ label: "main" }),
}));

const bootstrap = vi.fn();
const getSettings = vi.fn();
const listTags = vi.fn();
const listCreators = vi.fn();
const listTypeCounts = vi.fn();
const listTagCounts = vi.fn();

vi.mock("../api", () => ({
  api: {
    bootstrap: (...args: unknown[]) => bootstrap(...args),
    getSettings: (...args: unknown[]) => getSettings(...args),
    listTags: (...args: unknown[]) => listTags(...args),
    listCreators: (...args: unknown[]) => listCreators(...args),
    listTypeCounts: (...args: unknown[]) => listTypeCounts(...args),
    listTagCounts: (...args: unknown[]) => listTagCounts(...args),
  },
}));

afterEach(() => {
  listen.mockClear();
  bootstrap.mockReset();
  getSettings.mockReset();
  listTags.mockReset();
  listCreators.mockReset();
  listTypeCounts.mockReset();
  listTagCounts.mockReset();
});

describe("useLibraryChanged", () => {
  it("ignores events from this window and refreshes others after debounce", async () => {
    vi.useFakeTimers();
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
        externalPrograms: [],
        downloadsFolder: null,
      },
      folders: [],
      missingCount: 0,
    });
    listTags.mockResolvedValue([]);
    listCreators.mockResolvedValue([]);
    listTypeCounts.mockResolvedValue([]);
    listTagCounts.mockResolvedValue([]);
    const refreshLists = vi.fn(async () => undefined);
    const showToast = vi.fn();
    const setFolders = vi.fn();
    let handler: ((event: { payload: { kind: string; sourceWindow: string } }) => void) | null = null;
    listen.mockImplementation(async (...args: unknown[]) => {
      handler = args[1] as (event: { payload: { kind: string; sourceWindow: string } }) => void;
      return () => undefined;
    });
    const { unmount } = renderHook(() =>
      useLibraryChanged({
        ready: true,
        browse: { type: "root" },
        query: "",
        creator: "",
        sort: { field: "name", direction: "asc" },
        foldersRef: { current: [] },
        setFolders,
        setMissingCount: vi.fn(),
        setSettings: vi.fn(),
        setSidebarWidth: vi.fn(),
        setInspectorWidth: vi.fn(),
        setInspectorPinned: vi.fn(),
        setSidebarPinned: vi.fn(),
        setPreviewHeight: vi.fn(),
        setDetailsColumns: vi.fn(),
        setTheme: vi.fn(),
        setHistory: vi.fn(),
        setTags: vi.fn(),
        setCreators: vi.fn(),
        setCreatorOptions: vi.fn(),
        setTagCounts: vi.fn(),
        setTypeCounts: vi.fn(),
        refreshLists,
        refreshDownloads: vi.fn(async () => undefined),
        setThumbNonce: vi.fn(),
        showToast,
      }),
    );
    expect(handler).not.toBeNull();
    act(() => {
      handler?.({ payload: { kind: "all", sourceWindow: "main" } });
    });
    expect(refreshLists).not.toHaveBeenCalled();
    act(() => {
      handler?.({ payload: { kind: "files", sourceWindow: "win-2" } });
    });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(refreshLists).toHaveBeenCalledWith(
      { type: "root" },
      "",
      "",
      { field: "name", direction: "asc" },
    );
    expect(bootstrap).not.toHaveBeenCalled();
    unmount();
    vi.useRealTimers();
  });
});
