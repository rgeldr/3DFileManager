import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryModel } from "./hooks/useLibrary";
import type { Settings } from "./types";
import { AppShell } from "./App";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("./api", () => ({
  api: {
    setLibraryRoot: vi.fn(),
    setPaneWidths: vi.fn(),
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
