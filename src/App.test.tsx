import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import type { LibraryModel } from "./hooks/useLibrary";
import { clampInspector } from "./lib/paneWidths";
import type { Settings } from "./types";
import { AppShell } from "./App";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("./api", () => ({
  api: {
    setLibraryRoot: vi.fn(() => Promise.resolve()),
    setPaneWidths: vi.fn(() => Promise.resolve()),
    setSidebarPinned: vi.fn(() => Promise.resolve()),
    setInspectorPinned: vi.fn(() => Promise.resolve()),
    setPreviewHeight: vi.fn(() => Promise.resolve()),
    setDetailsColumns: vi.fn(() => Promise.resolve()),
    openInDefaultApp: vi.fn(() => Promise.resolve()),
    setSearchScope: vi.fn(() => Promise.resolve()),
    updateFile: vi.fn(async () => ({ cancelled: false })),
    setTags: vi.fn(async () => undefined),
    deleteFiles: vi.fn(async () => ({ cancelled: false })),
    revealFolder: vi.fn(() => Promise.resolve()),
    rescanLibrary: vi.fn(async () => ({ cancelled: false })),
    rescanFolder: vi.fn(async () => ({ cancelled: false })),
    moveFolder: vi.fn(),
    missingFiles: vi.fn(async () => []),
  },
}));

vi.mock("./hooks/useAppUpdate", () => ({
  useAppUpdate: () => ({
    banner: null,
    about: {
      busy: false,
      message: null,
      canInstall: false,
      onCheck: () => undefined,
      onInstall: () => undefined,
    },
  }),
}));

const thumbQueueCount = vi.fn(() => 0);

vi.mock("./hooks/useThumbQueueCount", () => ({
  useThumbQueueCount: () => thumbQueueCount(),
}));

vi.mock("./components/MenuBar", () => ({
  MenuBar: () => null,
}));

vi.mock("./components/FileGrid", () => ({
  FileGrid: (props: {
    onFolderContextMenu?: (event: { clientX: number; clientY: number }, folderId: number) => void;
    onOpen?: (file: { id: number }) => void;
    onOpenFolder?: (id: number) => void;
    onSort?: (field: string) => void;
    onClearFilters?: () => void;
    onContextMenu?: (event: { clientX: number; clientY: number }, file: { id: number }) => void;
    onDetailsColumnResizeEnd?: (id: string, width: number) => void;
  }) => (
    <div data-testid="file-grid">
      <button type="button" onClick={() => props.onOpen?.({ id: 5 })}>fg-open</button>
      <button type="button" onClick={() => props.onOpenFolder?.(2)}>fg-folder</button>
      <button type="button" onClick={() => props.onSort?.("size")}>fg-sort</button>
      <button type="button" onClick={() => props.onClearFilters?.()}>fg-clear</button>
      <button
        type="button"
        onClick={() =>
          props.onContextMenu?.({ clientX: 12, clientY: 34 } as unknown as React.MouseEvent, { id: 5 })
        }
      >
        fg-file-menu
      </button>
      <button
        type="button"
        onClick={() => props.onDetailsColumnResizeEnd?.("name", 280)}
      >
        fg-col
      </button>
      <div
        data-testid="folder-context-target"
        onContextMenu={(event) => props.onFolderContextMenu?.(event, 4)}
      />
    </div>
  ),
}));

vi.mock("./components/Inspector", () => ({
  Inspector: (props: {
    onPinnedChange: (next: boolean) => void;
    onPreviewHeight: (height: number) => void;
    onDelete: (id: number) => void;
    onSave: (file: { id: number; folderId: number | null; sortName: string; creator: string; notes: string }, tags: string[]) => void;
  }) => (
    <div data-testid="inspector">
      <button type="button" onClick={() => props.onPinnedChange(false)}>in-pin</button>
      <button type="button" onClick={() => props.onPreviewHeight(300)}>in-height</button>
      <button type="button" onClick={() => props.onDelete(5)}>in-delete</button>
      <button
        type="button"
        onClick={() =>
          props.onSave(
            { id: 5, folderId: 2, sortName: "part", creator: "Ada", notes: "" },
            ["PLA"],
          )
        }
      >
        in-save
      </button>
    </div>
  ),
  PinIcon: () => <span data-testid="pin-icon" />,
}));

vi.mock("./components/Breadcrumb", () => ({
  Breadcrumb: ({
    onNavigate,
    browse,
  }: {
    onNavigate: (place: { type: string; id?: number }) => void;
    browse: { type: string; id?: number };
  }) => (
    <>
      <button type="button" onClick={() => onNavigate({ type: "folder", id: 2 })}>
        bc-same
      </button>
      <button type="button" onClick={() => onNavigate({ type: "root" })}>
        bc-root
      </button>
      <span data-testid="browse-type">{browse.type}</span>
    </>
  ),
}));

vi.mock("./components/LibrarySearch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./components/LibrarySearch")>();
  return {
    ...actual,
    LibrarySearch: () => <div data-testid="search" />,
  };
});

vi.mock("./components/TagFilter", () => ({
  TagFilter: () => null,
}));

vi.mock("./components/TypeFilter", () => ({
  TypeFilter: () => null,
}));

vi.mock("./components/UpdateBanner", () => ({
  UpdateBanner: () => null,
}));

vi.mock("./components/dialogs", () => ({
  AboutDialog: () => null,
  ExternalProgramsDialog: () => null,
  TagColorDialog: () => null,
  CreatorDialog: () => null,
  DeleteFolderDialog: () => null,
  DiskProgressDialog: () => null,
  DragFailureDialog: () => null,
  ErrorDialog: () => null,
  FileContextMenu: () => null,
  FolderContextMenu: ({ menu }: { menu: { folderId: number } | null }) =>
    menu ? <div role="menu">folder {menu.folderId}</div> : null,
  FolderTagDialog: () => null,
  ImportProgressDialog: () => null,
  ImportSummaryDialog: () => null,
  MissingFilesDialog: () => null,
  NamePromptDialog: () => null,
  Toast: () => null,
}));

afterEach(() => cleanup());

beforeEach(() => {
  thumbQueueCount.mockReturnValue(0);
});

const baseSettings: Settings = {
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
  externalPrograms: [],
  downloadsFolder: null,
};

function libraryModel(overrides: Record<string, unknown> = {}): LibraryModel {
  const noop = () => undefined;
  return {
    ready: true,
    settings: baseSettings,
    setSettings: noop,
    folders: [],
    setFolders: noop,
    files: [],
    browse: { type: "root" },
    setBrowse: noop,
    query: "",
    setQuery: noop,
    creator: "",
    setCreator: noop,
    selectedTagIds: [],
    setSelectedTagIds: noop,
    selectedTypeIds: [],
    setSelectedTypeIds: noop,
    typeCounts: [],
    tagMatch: "any",
    setTagMatch: noop,
    tagCounts: [],
    sort: { field: "name", direction: "asc" },
    setSort: noop,
    creators: [],
    creatorOptions: [],
    tags: [],
    selected: [],
    setSelected: noop,
    missingCount: 0,
    listTruncated: false,
    setMissingCount: noop,
    setMissingOpen: noop,
    setMissingFiles: noop,
    chosenRoot: null,
    setChosenRoot: noop,
    setFolderTagTarget: noop,
    setCreatorTarget: noop,
    setCreatorValue: noop,
    setIncludeSubfolders: noop,
    setFileMenu: noop,
    sidebarWidth: 240,
    setSidebarWidth: noop,
    inspectorWidth: 320,
    setInspectorWidth: noop,
    inspectorPinned: true,
    setInspectorPinned: noop,
    sidebarPinned: true,
    setSidebarPinned: noop,
    previewHeight: 240,
    setPreviewHeight: noop,
    detailsColumns: baseSettings.detailsColumns,
    setDetailsColumns: noop,
    setFolderTagInput: noop,
    error: null,
    setError: noop,
    actions: { current: { restoreLibrary: noop } },
    gridScrollRef: { current: null },
    sidebarWidthRef: { current: 240 },
    inspectorWidthRef: { current: 320 },
    previewIconsEnabled: false,
    folderExpandHint: null,
    setFolderExpandHint: noop,
    libraryName: "Library",
    refreshLists: async () => undefined,
    runDiskOp: async () => undefined,
    openNewFolderPrompt: noop,
    openRenameFolderPrompt: noop,
    openDeleteFolderConfirm: noop,
    browseKey: "root",
    onSelect: noop,
    selectedFile: null,
    dropTarget: null,
    draggingGridFolderId: null,
    onPointerDown: noop,
    onMoveFolder: noop,
    theme: "dark",
    themeItems: { current: {} },
    gridItems: { current: {} },
    ...overrides,
  } as unknown as LibraryModel;
}

describe("AppShell", () => {
  it("shows the setup screen when there is no library root", () => {
    render(<AppShell app={libraryModel()} />);
    expect(screen.getByText("3D File Library")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choose folder" })).toBeTruthy();
    expect(document.querySelector(".setup")).toBeTruthy();
    expect(document.querySelector(".app")).toBeNull();
  });

  it("renders the main app chrome when a library root is configured", () => {
    render(
      <AppShell
        app={libraryModel({
          settings: { ...baseSettings, libraryRoot: "/library" },
        })}
      />,
    );
    expect(document.querySelector(".app")).toBeTruthy();
    expect(screen.getByText("Downloads")).toBeTruthy();
    expect(screen.getByTestId("file-grid")).toBeTruthy();
    expect(screen.getByTestId("inspector")).toBeTruthy();
    const scope = screen.getByRole("radiogroup", { name: "Search scope" });
    const creator = screen.getByLabelText("Creator");
    expect(scope.closest(".toolbar-creator")).toBe(creator.parentElement);
    expect(scope.nextElementSibling).toBe(creator);
    expect(screen.getByTestId("search").contains(scope)).toBe(false);
    expect((screen.getByLabelText("Current folder") as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByLabelText("Entire library") as HTMLInputElement).checked).toBe(true);
  });

  it("shows Downloads as a local Details list and does not mount the catalog grid", () => {
    const setSettings = vi.fn();
    render(
      <AppShell
        app={libraryModel({
          settings: { ...baseSettings, libraryRoot: "/library", gridSize: "large" },
          browse: { type: "downloads" },
          browseKey: "downloads",
          setSettings,
          downloadsList: {
            status: "ok",
            rows: [
              {
                name: "boat.stl",
                relativeDir: "prints",
                ext: "stl",
                sizeBytes: 4,
                mtime: 1,
                absolutePath: "C:\\Users\\me\\Downloads\\prints\\boat.stl",
              },
            ],
            truncated: false,
          },
          downloadsTruncated: false,
          downloadSort: { field: "path", direction: "asc" },
          setDownloadSort: () => undefined,
          downloadsSelected: [],
          setDownloadsSelected: () => undefined,
          downloadsMenu: null,
          setDownloadsMenu: () => undefined,
          refreshDownloads: async () => undefined,
          applyDownloadsFolder: async () => undefined,
          selectedDownloadRow: null,
        })}
      />,
    );
    expect(screen.queryByTestId("file-grid")).toBeNull();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: /Path/ })).toBeTruthy();
    expect(screen.getByText("prints")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Large" })).toBeNull();
    expect((screen.getByLabelText("Creator") as HTMLSelectElement).disabled).toBe(true);
    expect(setSettings).not.toHaveBeenCalled();
    const toolbar = document.querySelector(".toolbar");
    const leading = toolbar?.querySelector(".toolbar-leading");
    expect(leading?.contains(screen.getByRole("button", { name: "Refresh" }))).toBe(true);
    expect(leading?.contains(screen.getByTestId("search"))).toBe(true);
    const filters = toolbar?.querySelector("fieldset.toolbar-filters");
    expect(filters?.contains(screen.getByTestId("search"))).toBe(false);
    expect(filters?.contains(screen.getByLabelText("Creator"))).toBe(true);
    const scope = screen.getByRole("radiogroup", { name: "Search scope" });
    expect(filters?.contains(scope)).toBe(true);
    expect(leading?.contains(scope)).toBe(false);
    expect(scope.nextElementSibling).toBe(screen.getByLabelText("Creator"));
    expect((screen.getByLabelText("Current folder") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Entire library") as HTMLInputElement).disabled).toBe(true);
  });

  it("gives Downloads the library inspector width and the same resize persistence", () => {
    const previousWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1600 });
    const setInspectorWidth = vi.fn();
    const inspectorWidthRef = { current: 320 };
    const sidebarWidthRef = { current: 240 };
    const downloads = {
      settings: { ...baseSettings, libraryRoot: "/library", inspectorWidth: 320, inspectorPinned: true },
      inspectorWidth: 320,
      inspectorPinned: true,
      sidebarWidth: 240,
      setInspectorWidth,
      inspectorWidthRef,
      sidebarWidthRef,
      browse: { type: "downloads" as const },
      browseKey: "downloads",
      downloadsList: { status: "ok" as const, rows: [], truncated: false },
      downloadsTruncated: false,
      downloadSort: { field: "path" as const, direction: "asc" as const },
      setDownloadSort: () => undefined,
      downloadsSelected: ["C:\\Users\\me\\Downloads\\boat.stl"],
      setDownloadsSelected: () => undefined,
      downloadsMenu: null,
      setDownloadsMenu: () => undefined,
      refreshDownloads: async () => undefined,
      applyDownloadsFolder: async () => undefined,
      selectedDownloadRow: {
        name: "boat.stl",
        relativeDir: "prints",
        ext: "stl",
        sizeBytes: 4096,
        mtime: 1_700_000_000,
        absolutePath: "C:\\Users\\me\\Downloads\\prints\\boat.stl",
      },
    };
    const library = {
      settings: { ...baseSettings, libraryRoot: "/library", inspectorWidth: 320, inspectorPinned: true },
      inspectorWidth: 320,
      inspectorPinned: true,
      sidebarWidth: 240,
      inspectorWidthRef: { current: 320 },
      sidebarWidthRef: { current: 240 },
    };
    const drag = (label: "library" | "downloads") => {
      const handle = screen.getByRole("separator", { name: "Resize details" });
      handle.setPointerCapture = vi.fn();
      handle.releasePointerCapture = vi.fn();
      handle.hasPointerCapture = () => true;
      fireEvent.pointerDown(handle, { clientX: 800, button: 0, pointerId: 1 });
      fireEvent.pointerMove(handle, { clientX: 700, pointerId: 1 });
      fireEvent.pointerUp(handle, { clientX: 700, pointerId: 1 });
      return label;
    };
    render(<AppShell app={libraryModel(library)} />);
    const libraryApp = document.querySelector(".app") as HTMLElement;
    expect(libraryApp.style.getPropertyValue("--inspector-width")).toBe("320px");
    expect(screen.getByRole("separator", { name: "Resize details" })).toBeTruthy();
    drag("library");
    const libraryCall = vi.mocked(api.setPaneWidths).mock.calls.at(-1);
    cleanup();
    vi.mocked(api.setPaneWidths).mockClear();

    render(<AppShell app={libraryModel(downloads)} />);
    const downloadsApp = document.querySelector(".app") as HTMLElement;
    expect(downloadsApp.style.getPropertyValue("--inspector-width")).toBe("320px");
    expect(document.querySelector(".workspace .inspector")).toBeTruthy();
    expect(screen.getByRole("separator", { name: "Resize details" })).toBeTruthy();
    expect(screen.getByText("prints")).toBeTruthy();
    expect(screen.getByText("C:\\Users\\me\\Downloads\\prints\\boat.stl")).toBeTruthy();
    expect(screen.getByText("4.0 KB")).toBeTruthy();
    drag("downloads");
    expect(setInspectorWidth).toHaveBeenCalledWith(clampInspector(420, 1600));
    expect(api.setPaneWidths).toHaveBeenCalledWith(240, clampInspector(420, 1600));
    expect(vi.mocked(api.setPaneWidths).mock.calls.at(-1)).toEqual(libraryCall);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: previousWidth });
  });

  it("opens the existing folder menu when a grid folder is right-clicked", () => {
    render(
      <AppShell
        app={libraryModel({
          settings: { ...baseSettings, libraryRoot: "/library" },
        })}
      />,
    );
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.contextMenu(screen.getByTestId("folder-context-target"));
    expect(screen.getByRole("menu").textContent).toBe("folder 4");
  });

  it("shows the missing-files banner and opens the review dialog", async () => {
    const setMissingOpen = vi.fn();
    const setMissingFiles = vi.fn();
    vi.mocked(api.missingFiles).mockResolvedValue([{ id: 1, path: "gone.stl" }]);
    render(
      <AppShell
        app={libraryModel({
          settings: { ...baseSettings, libraryRoot: "/library" },
          missingCount: 3,
          setMissingOpen,
          setMissingFiles,
        })}
      />,
    );
    expect(screen.getByText(/3 catalog entries are missing/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    await waitFor(() => expect(setMissingFiles).toHaveBeenCalled());
    expect(setMissingOpen).toHaveBeenCalledWith(true);
  });

  it("switches grid size through the footer view toggle", () => {
    const setGrid = vi.fn();
    render(
      <AppShell
        app={libraryModel({
          settings: { ...baseSettings, libraryRoot: "/library", gridSize: "large" },
          actions: { current: { restoreLibrary: () => undefined, setGrid } },
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "List" }));
    expect(setGrid).toHaveBeenCalledWith("list");
  });

  it("chooses a library folder on the setup screen", async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    vi.mocked(open).mockResolvedValue("D:\\LibraryRoot");
    const setChosenRoot = vi.fn();
    render(<AppShell app={libraryModel({ setChosenRoot })} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose folder" }));
    await waitFor(() => expect(setChosenRoot).toHaveBeenCalledWith("D:\\LibraryRoot"));
  });

  it("wires sidebar, grid, inspector, and breadcrumb handlers", async () => {
    const runDiskOp = vi.fn(async (opts: { run: () => Promise<{ cancelled: boolean }> }) => {
      await opts.run();
    });
    const setBrowse = vi.fn();
    const setSelected = vi.fn();
    const setFolderTagTarget = vi.fn();
    const setCreatorTarget = vi.fn();
    const setFileMenu = vi.fn();
    const onSelect = vi.fn();
    const setSettings = vi.fn();
    const setSelectedTagIds = vi.fn();
    const setSelectedTypeIds = vi.fn();
    const setSort = vi.fn();
    const setDetailsColumns = vi.fn((value: unknown) => {
      if (typeof value === "function") {
        (value as (current: Settings["detailsColumns"]) => Settings["detailsColumns"])(
          baseSettings.detailsColumns,
        );
      }
    });
    render(
      <AppShell
        app={libraryModel({
          settings: { ...baseSettings, libraryRoot: "/library", searchScope: "library" },
          folders: [{ id: 2, parentId: null, name: "Prints", relpath: "Prints", sortOrder: 0 }],
          files: [{ id: 5, sortName: "part", folderId: 2 } as never],
          selectedFile: { id: 5, folderId: 2, sortName: "part" } as never,
          selectedTagIds: [1],
          selectedTypeIds: ["stl"],
          runDiskOp,
          setBrowse,
          setSelected,
          setFolderTagTarget,
          setCreatorTarget,
          setFileMenu,
          setSettings,
          setSelectedTagIds,
          setSelectedTypeIds,
          setSort,
          setDetailsColumns,
          onSelect,
          selected: [],
        })}
      />,
    );
    fireEvent.click(screen.getByText("Prints"));
    expect(setBrowse).toHaveBeenCalledWith({ type: "folder", id: 2 });
    fireEvent.contextMenu(screen.getByText("Prints"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Show in Explorer" }));
    expect(api.revealFolder).toHaveBeenCalledWith(2);
    fireEvent.contextMenu(screen.getByText("Prints"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Rescan" }));
    expect(runDiskOp).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Rescanning "Prints"...',
      cancellable: true,
    }));
    fireEvent.contextMenu(screen.getByText("Prints"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Tag contents…" }));
    expect(setFolderTagTarget).toHaveBeenCalledWith({ folderId: 2, name: "Prints" });
    fireEvent.contextMenu(screen.getByText("Prints"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Set Creator…" }));
    expect(setCreatorTarget).toHaveBeenCalledWith({ folderId: 2, name: "Prints" });
    fireEvent.click(screen.getByRole("button", { name: "Unpin folders" }));
    expect(setSettings).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "bc-root" }));
    fireEvent.click(screen.getByRole("button", { name: "fg-open" }));
    expect(api.openInDefaultApp).toHaveBeenCalledWith(5);
    fireEvent.click(screen.getByRole("button", { name: "fg-folder" }));
    fireEvent.click(screen.getByRole("button", { name: "fg-sort" }));
    fireEvent.click(screen.getByRole("button", { name: "fg-clear" }));
    expect(setSelectedTagIds).toHaveBeenCalledWith([]);
    fireEvent.click(screen.getByRole("button", { name: "fg-file-menu" }));
    expect(onSelect).toHaveBeenCalledWith(5, "replace");
    expect(setFileMenu).toHaveBeenCalledWith({ x: 12, y: 34, fileId: 5 });
    fireEvent.click(screen.getByRole("button", { name: "fg-col" }));
    expect(api.setDetailsColumns).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "in-save" }));
    expect(runDiskOp).toHaveBeenCalledWith(expect.objectContaining({
      title: "Saving...",
      cancellable: false,
    }));
    fireEvent.click(screen.getByRole("button", { name: "in-delete" }));
    fireEvent.click(screen.getByRole("button", { name: "in-height" }));
    expect(api.setPreviewHeight).toHaveBeenCalledWith(300);
    fireEvent.click(screen.getByRole("button", { name: "in-pin" }));
    fireEvent.contextMenu(screen.getByTestId("folder-context-target"));
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("shows truncated search and updates search scope", () => {
    const setSettings = vi.fn((value: unknown) => {
      if (typeof value === "function") {
        (value as (current: Settings | null) => Settings | null)({
          ...baseSettings,
          libraryRoot: "/library",
          searchScope: "library",
        });
      }
    });
    render(
      <AppShell
        app={libraryModel({
          settings: { ...baseSettings, libraryRoot: "/library", searchScope: "library" },
          listTruncated: true,
          setSettings,
        })}
      />,
    );
    expect(screen.getByText(/Showing the first/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Current folder"));
    expect(setSettings).toHaveBeenCalled();
    expect(api.setSearchScope).toHaveBeenCalledWith("folder");
  });

  it("bootstraps the library from the setup continue action", async () => {
    vi.mocked(api.setLibraryRoot).mockResolvedValue({
      settings: { ...baseSettings, libraryRoot: "D:\\lib" },
      folders: [],
      missingCount: 0,
    });
    const refreshLists = vi.fn(async () => undefined);
    render(
      <AppShell
        app={libraryModel({
          chosenRoot: "D:\\lib",
          refreshLists,
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(api.setLibraryRoot).toHaveBeenCalledWith("D:\\lib"));
    expect(refreshLists).toHaveBeenCalled();
  });

  it("starts backup import from the setup screen", () => {
    const restoreLibrary = vi.fn();
    render(
      <AppShell
        app={libraryModel({
          actions: { current: { restoreLibrary } },
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Import backup folder…" }));
    expect(restoreLibrary).toHaveBeenCalledWith(undefined);
  });

  it("exercises all footer view toggles", () => {
    const setGrid = vi.fn();
    render(
      <AppShell
        app={libraryModel({
          settings: { ...baseSettings, libraryRoot: "/library", gridSize: "large" },
          actions: { current: { restoreLibrary: () => undefined, setGrid } },
        })}
      />,
    );
    for (const label of ["Medium", "Extra large", "Details"]) {
      fireEvent.click(screen.getByRole("button", { name: label }));
    }
    expect(setGrid).toHaveBeenCalledWith("medium");
    expect(setGrid).toHaveBeenCalledWith("extraLarge");
    expect(setGrid).toHaveBeenCalledWith("details");
  });

  it("uses a cancellable disk job when inspector save moves a file", () => {
    const runDiskOp = vi.fn(async (opts: { title: string; cancellable: boolean; run: () => Promise<unknown> }) => {
      await opts.run();
    });
    render(
      <AppShell
        app={libraryModel({
          settings: { ...baseSettings, libraryRoot: "/library" },
          files: [{ id: 5, sortName: "part", folderId: null } as never],
          selectedFile: { id: 5, sortName: "part", folderId: null } as never,
          runDiskOp,
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "in-save" }));
    const call = runDiskOp.mock.calls.at(-1)?.[0] as { cancellable: boolean; title: string };
    expect(call.cancellable).toBe(true);
    expect(call.title).toMatch(/Moving/);
  });

  it("mentions pending thumbnails in the status bar", () => {
    thumbQueueCount.mockReturnValue(2);
    render(
      <AppShell
        app={libraryModel({
          settings: { ...baseSettings, libraryRoot: "/library" },
          files: [fileStub()],
        })}
      />,
    );
    expect(screen.getByText(/2 thumbnails still generating/)).toBeTruthy();
  });

  it("ignores breadcrumb navigation to the current place", () => {
    const setBrowse = vi.fn();
    render(
      <AppShell
        app={libraryModel({
          settings: { ...baseSettings, libraryRoot: "/library" },
          browse: { type: "folder", id: 2 },
          setBrowse,
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "bc-same" }));
    expect(setBrowse).not.toHaveBeenCalled();
  });

  it("shows a banner when the downloads list is truncated", () => {
    render(
      <AppShell
        app={libraryModel({
          settings: { ...baseSettings, libraryRoot: "/library" },
          browse: { type: "downloads" },
          browseKey: "downloads",
          downloadsList: { status: "ok", rows: [], truncated: false },
          downloadsTruncated: true,
          downloadSort: { field: "path", direction: "asc" },
          setDownloadSort: () => undefined,
          downloadsSelected: [],
          setDownloadsSelected: () => undefined,
          downloadsMenu: null,
          setDownloadsMenu: () => undefined,
          refreshDownloads: async () => undefined,
          applyDownloadsFolder: async () => undefined,
          selectedDownloadRow: null,
        })}
      />,
    );
    expect(screen.getByText(/Downloads list is truncated/)).toBeTruthy();
  });

  it("collapses the sidebar rail when unpinned", () => {
    render(
      <AppShell
        app={libraryModel({
          settings: { ...baseSettings, libraryRoot: "/library", sidebarPinned: false },
          sidebarPinned: false,
        })}
      />,
    );
    expect(document.querySelector(".app-panes.sidebar-collapsed")).toBeTruthy();
  });

  it("collapses the inspector workspace when unpinned", () => {
    render(
      <AppShell
        app={libraryModel({
          settings: { ...baseSettings, libraryRoot: "/library", inspectorPinned: false },
          inspectorPinned: false,
        })}
      />,
    );
    expect(document.querySelector(".workspace.inspector-collapsed")).toBeTruthy();
  });

  it("uses singular copy in the status bar for one catalog file", () => {
    render(
      <AppShell
        app={libraryModel({
          settings: { ...baseSettings, libraryRoot: "/library" },
          files: [fileStub()],
        })}
      />,
    );
    expect(screen.getByText("1 file")).toBeTruthy();
  });

  it("uses singular thumbnail queue copy", () => {
    thumbQueueCount.mockReturnValue(1);
    render(
      <AppShell
        app={libraryModel({
          settings: { ...baseSettings, libraryRoot: "/library" },
          files: [fileStub(), { ...fileStub(), id: 2, sortName: "b" }],
          selected: [1],
        })}
      />,
    );
    expect(screen.getByText(/1 thumbnail still generating/)).toBeTruthy();
    expect(screen.getByText(/1 selected/)).toBeTruthy();
  });

  it("uses singular copy for one downloaded file in the status bar", () => {
    render(
      <AppShell
        app={libraryModel({
          settings: { ...baseSettings, libraryRoot: "/library" },
          browse: { type: "downloads" },
          browseKey: "downloads",
          downloadsList: {
            status: "ok",
            rows: [
              {
                name: "boat.stl",
                relativeDir: "",
                ext: "stl",
                sizeBytes: 4,
                mtime: 1,
                absolutePath: "C:\\Users\\me\\Downloads\\boat.stl",
              },
            ],
            truncated: false,
          },
          downloadsTruncated: false,
          downloadSort: { field: "path", direction: "asc" },
          setDownloadSort: () => undefined,
          downloadsSelected: [],
          setDownloadsSelected: () => undefined,
          downloadsMenu: null,
          setDownloadsMenu: () => undefined,
          refreshDownloads: async () => undefined,
          applyDownloadsFolder: async () => undefined,
          selectedDownloadRow: null,
        })}
      />,
    );
    expect(screen.getByText("1 file")).toBeTruthy();
  });
});

function fileStub() {
  return {
    id: 1,
    sortName: "a",
    folderId: null,
    ext: "stl",
  } as never;
}
