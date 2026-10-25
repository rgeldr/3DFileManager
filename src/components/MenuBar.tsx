import { useEffect } from "react";
import { CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";
import type { Settings, ViewMode } from "../types";
import type { Actions } from "../hooks/libraryTypes";

const VIEW_MODES: ViewMode[] = ["medium", "large", "extraLarge", "list", "details"];

export function MenuBar(s: {
  theme: "dark" | "light";
  settings: Settings | null;
  ready: boolean;
  actions: { current: Actions };
  themeItems: { current: { dark?: CheckMenuItem; light?: CheckMenuItem } };
  gridItems: { current: Partial<Record<ViewMode, CheckMenuItem>> };
}) {
  const { theme, settings, ready, actions, themeItems, gridItems } = s;
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const dark = await CheckMenuItem.new({
        id: "theme-dark",
        text: "Dark",
        checked: theme === "dark",
        action: () => actions.current.setTheme("dark"),
      });
      const light = await CheckMenuItem.new({
        id: "theme-light",
        text: "Light",
        checked: theme === "light",
        action: () => actions.current.setTheme("light"),
      });
      const items: Partial<Record<ViewMode, CheckMenuItem>> = {};
      const labels: Record<ViewMode, string> = {
        medium: "Medium",
        large: "Large",
        extraLarge: "Extra large",
        list: "List",
        details: "Details",
      };
      for (const mode of VIEW_MODES) {
        items[mode] = await CheckMenuItem.new({
          id: `grid-${mode}`,
          text: labels[mode],
          checked: settings?.gridSize === mode,
          action: () => actions.current.setGrid(mode),
        });
      }
      themeItems.current = { dark, light };
      gridItems.current = items;
      const viewItems = await Promise.all(VIEW_MODES.map((mode) => items[mode]!));
      const menu = await Menu.new({
        items: [
          await Submenu.new({
            text: "File",
            items: [
              await MenuItem.new({ text: "Import folder...", action: () => actions.current.importFolder() }),
              await MenuItem.new({ text: "Import archive...", action: () => actions.current.importArchive() }),
              await PredefinedMenuItem.new({ item: "Separator" }),
              await MenuItem.new({ text: "Move library...", action: () => actions.current.moveLibrary() }),
              await MenuItem.new({ text: "Backup library...", action: () => actions.current.backupLibrary() }),
              await MenuItem.new({ text: "Import backup...", action: () => actions.current.restoreLibrary() }),
              await MenuItem.new({ text: "Rescan library", action: () => actions.current.rescan() }),
              await MenuItem.new({ text: "Clear thumbnail cache", action: () => actions.current.clearThumbs() }),
              await PredefinedMenuItem.new({ item: "Separator" }),
              await PredefinedMenuItem.new({ item: "Quit" }),
            ],
          }),
          await Submenu.new({
            text: "View",
            items: [
              ...viewItems,
              await PredefinedMenuItem.new({ item: "Separator" }),
              await Submenu.new({ text: "Theme", items: [dark, light] }),
              await MenuItem.new({ text: "Tag color…", action: () => actions.current.openTagColors() }),
            ],
          }),
          await Submenu.new({
            text: "Help",
            items: [
              await MenuItem.new({ text: "About", action: () => actions.current.showAbout() }),
            ],
          }),
        ],
      });
      if (!cancelled) await menu.setAsAppMenu();
    })();
    return () => {
      cancelled = true;
    };
  }, [ready]);

  useEffect(() => {
    void themeItems.current.dark?.setChecked(theme === "dark");
    void themeItems.current.light?.setChecked(theme === "light");
  }, [theme]);

  useEffect(() => {
    const size = settings?.gridSize ?? "large";
    for (const mode of VIEW_MODES) {
      void gridItems.current[mode]?.setChecked(size === mode);
    }
  }, [settings?.gridSize]);
  return null;
}
