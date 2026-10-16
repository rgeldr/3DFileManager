import { useEffect } from "react";
import { CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";
import type { GridSize, Settings } from "../types";
import type { Actions } from "../hooks/libraryTypes";

export function MenuBar(s: {
  theme: "dark" | "light";
  settings: Settings | null;
  ready: boolean;
  actions: { current: Actions };
  themeItems: { current: { dark?: CheckMenuItem; light?: CheckMenuItem } };
  gridItems: { current: Partial<Record<GridSize, CheckMenuItem>> };
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
      const medium = await CheckMenuItem.new({
        id: "grid-medium",
        text: "Medium",
        checked: settings?.gridSize === "medium",
        action: () => actions.current.setGrid("medium"),
      });
      const large = await CheckMenuItem.new({
        id: "grid-large",
        text: "Large",
        checked: settings?.gridSize === "large",
        action: () => actions.current.setGrid("large"),
      });
      const extra = await CheckMenuItem.new({
        id: "grid-extra",
        text: "Extra large",
        checked: settings?.gridSize === "extraLarge",
        action: () => actions.current.setGrid("extraLarge"),
      });
      themeItems.current = { dark, light };
      gridItems.current = { medium, large, extraLarge: extra };
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
              medium,
              large,
              extra,
              await PredefinedMenuItem.new({ item: "Separator" }),
              await Submenu.new({ text: "Theme", items: [dark, light] }),
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
    void gridItems.current.medium?.setChecked(size === "medium");
    void gridItems.current.large?.setChecked(size === "large");
    void gridItems.current.extraLarge?.setChecked(size === "extraLarge");
  }, [settings?.gridSize]);
  return null;
}
