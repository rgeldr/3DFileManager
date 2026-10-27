import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "../types";
import { MenuBar } from "./MenuBar";

type MenuRecord = {
  text?: string;
  action?: () => void;
  checked?: boolean;
  setChecked: ReturnType<typeof vi.fn>;
  item?: string;
  items?: MenuRecord[];
};

const created: MenuRecord[] = [];

function record(input: Record<string, unknown>): MenuRecord {
  const entry: MenuRecord = {
    text: input.text as string | undefined,
    action: input.action as (() => void) | undefined,
    checked: input.checked as boolean | undefined,
    setChecked: vi.fn(async () => undefined),
    item: input.item as string | undefined,
    items: input.items as MenuRecord[] | undefined,
  };
  created.push(entry);
  return entry;
}

vi.mock("@tauri-apps/api/menu", () => ({
  CheckMenuItem: {
    new: async (input: Record<string, unknown>) => record(input),
  },
  MenuItem: {
    new: async (input: Record<string, unknown>) => record(input),
  },
  PredefinedMenuItem: {
    new: async (input: Record<string, unknown>) => record(input),
  },
  Submenu: {
    new: async (input: Record<string, unknown>) => record(input),
  },
  Menu: {
    new: async (input: Record<string, unknown>) => {
      const menu = record(input);
      return {
        ...menu,
        setAsAppMenu: vi.fn(async () => undefined),
      };
    },
  },
}));

afterEach(() => {
  created.length = 0;
  vi.restoreAllMocks();
});

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
};

describe("MenuBar", () => {
  it("wires File menu actions and syncs theme/grid checked state", async () => {
    const actions = {
      current: {
        importFolder: vi.fn(),
        importArchive: vi.fn(),
        moveLibrary: vi.fn(),
        backupLibrary: vi.fn(),
        restoreLibrary: vi.fn(),
        rescan: vi.fn(),
        clearThumbs: vi.fn(),
        setTheme: vi.fn(),
        setGrid: vi.fn(),
        showAbout: vi.fn(),
        openTagColors: vi.fn(),
      },
    };
    const themeItems = { current: {} as Record<string, MenuRecord> };
    const gridItems = { current: {} as Record<string, MenuRecord> };

    const view = render(
      <MenuBar
        theme="dark"
        settings={settings}
        ready
        actions={actions}
        themeItems={themeItems}
        gridItems={gridItems}
      />,
    );

    await waitFor(() => expect(created.some((item) => item.text === "Import folder...")).toBe(true));

    const byText = (text: string) => created.find((item) => item.text === text);
    byText("Import folder...")?.action?.();
    byText("Import archive...")?.action?.();
    byText("Move library...")?.action?.();
    byText("Backup library...")?.action?.();
    byText("Import backup...")?.action?.();
    byText("Rescan library")?.action?.();
    byText("Clear thumbnail cache")?.action?.();
    byText("About")?.action?.();
    byText("Tag color…")?.action?.();
    byText("Dark")?.action?.();
    byText("Large")?.action?.();

    expect(actions.current.importFolder).toHaveBeenCalled();
    expect(actions.current.importArchive).toHaveBeenCalled();
    expect(actions.current.moveLibrary).toHaveBeenCalled();
    expect(actions.current.backupLibrary).toHaveBeenCalled();
    expect(actions.current.restoreLibrary).toHaveBeenCalled();
    expect(actions.current.rescan).toHaveBeenCalled();
    expect(actions.current.clearThumbs).toHaveBeenCalled();
    expect(actions.current.showAbout).toHaveBeenCalled();
    expect(actions.current.openTagColors).toHaveBeenCalled();
    expect(actions.current.setTheme).toHaveBeenCalledWith("dark");
    expect(actions.current.setGrid).toHaveBeenCalledWith("large");

    view.rerender(
      <MenuBar
        theme="light"
        settings={{ ...settings, gridSize: "list" }}
        ready
        actions={actions}
        themeItems={themeItems}
        gridItems={gridItems}
      />,
    );

    await waitFor(() => {
      expect(themeItems.current.light?.setChecked).toHaveBeenCalledWith(true);
      expect(themeItems.current.dark?.setChecked).toHaveBeenCalledWith(false);
      expect(gridItems.current.list?.setChecked).toHaveBeenCalledWith(true);
      expect(gridItems.current.large?.setChecked).toHaveBeenCalledWith(false);
    });
  });
});
