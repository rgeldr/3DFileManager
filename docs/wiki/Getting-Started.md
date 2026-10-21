# Getting Started

## Install

1. Open [GitHub Releases](https://github.com/rgeldr/3DFileManager/releases).
2. Download `3D.File.Library_<version>_x64-setup.exe` for the release you want.
3. Run the installer. It installs for the current user and uses WebView2.
4. Start **3D File Library** from the Start menu.

## Choose a library folder

The first window offers two choices. The catalog database stays in `%APPDATA%\3D File Library\`, not in the library folder.

**New library**

1. Click **Choose folder** and pick an empty folder. This is where the print files are stored.
2. Click **Continue**.

**Import backup** is covered in [Library Maintenance](https://github.com/rgeldr/3DFileManager/wiki/Library-Maintenance).

If the folder has no folders yet, the app creates three:

- FDM Prints
- Models
- Wargaming Terrain

You can rename or delete those folders later. Delete is only offered for an empty folder, and not for the library root.

## The window

- The left pane is the folder tree. Drag the splitter to resize it. A clipped folder name shows the full name in a tooltip.
- The center is the file list for the folder you selected. The library root shows the top-level folders.
- The right pane is details and preview for the selected file. The pin button collapses it. Drag its splitter to resize it, and drag the preview splitter to change the preview height.
- The toolbar has search, Clear, search scope, File Types, Tags, Creator, and Sort.
- The status bar shows how many files are listed, how many are selected, and a thumbnail count while thumbnails are still generating. The view buttons are Medium, Large, Extra large, List, and Details.

View, theme, pane widths, preview height, whether details are pinned, and search scope are restored the next time the app opens.

## Theme and view

**View** in the menu bar, or the buttons in the status bar, switches the file list:

- **Medium**, **Large**, and **Extra large** are tile grids.
- **List** is a compact row of folders and files.
- **Details** adds Name, Size, Date modified, Date added, and Creator. Click a column header to sort. Click it again to reverse the sort.

**View > Theme** switches between Dark and Light.

## Select files

- Click a file to select it.
- Ctrl-click (or Cmd-click) toggles a file in the selection.
- Shift-click selects a range.
- Drag an empty area of the file list to draw a selection rectangle.

Double-click a file to open it in the default app. Double-click a folder to open that folder.
