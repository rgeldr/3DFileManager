import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    setLibraryRoot: vi.fn(),
    setPaneWidths: vi.fn(() => Promise.resolve()),
    setSidebarPinned: vi.fn(),
    setInspectorPinned: vi.fn(),
    setPreviewHeight: vi.fn(),
    setDetailsColumns: vi.fn(),
    revealFolder: vi.fn(),
    rescanLibrary: vi.fn(),
    rescanFolder: vi.fn(),
    moveFolder: vi.fn(),
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

vi.mock("./hooks/useThumbQueueCount", () => ({
  useThumbQueueCount: () => 0,
}));

vi.mock("./components/MenuBar", () => ({
  MenuBar: () => null,
}));

vi.mock("./components/Sidebar", () => ({
  Sidebar: () => <div data-testid="sidebar" />,
}));

vi.mock("./components/FileGrid", () => ({
  FileGrid: ({
    onFolderContextMenu,
  }: {
    onFolderContextMenu?: (event: { clientX: number; clientY: number }, folderId: number) => void;
  }) => (
    <div
      data-testid="file-grid"
      onContextMenu={(event) => onFolderContextMenu?.(event, 4)}
    />
  ),
}));

vi.mock("./components/Inspector", () => ({
  Inspector: () => <div data-testid="inspector" />,
  PinIcon: () => <span data-testid="pin-icon" />,
}));

vi.mock("./components/Breadcrumb", () => ({
  Breadcrumb: () => <div data-testid="breadcrumb" />,
}));

vi.mock("./components/LibrarySearch", () => ({
  LibrarySearch: () => <div data-testid="search" />,
}));

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
    onPointerDown: noop,
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
    expect(screen.getByTestId("sidebar")).toBeTruthy();
    expect(screen.getByTestId("file-grid")).toBeTruthy();
    expect(screen.getByTestId("inspector")).toBeTruthy();
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
    fireEvent.contextMenu(screen.getByTestId("file-grid"));
    expect(screen.getByRole("menu").textContent).toBe("folder 4");
  });
});
