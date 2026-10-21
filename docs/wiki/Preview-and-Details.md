# Preview and Details

Select a file to show it in the details pane. The pin keeps that pane open. Unpin it to give the file list the full width. Pin state is restored next launch.

Drag **Resize preview** to change how tall the preview is. Double-click that splitter to return it to the default height. Arrow keys nudge it while the splitter is focused. The height is saved.

## What the preview shows

- **stl**, **obj**, and **3mf** files up to 150 MB open as a 3D mesh. Drag to orbit. Files over 150 MB say they are too large to preview.
- **png**, **jpg**, and **jpeg** show the image.
- **txt**, **md**, and **scad** show the first 4KB as text. Control bytes and invalid UTF-8 are omitted.
- **pdf** shows a PDF badge. There is no in-app PDF viewer.
- **step** and **stp** are stored with no in-app preview.
- Slicer and project files can show an embedded thumbnail when the file contains one: **ctb**, **chitubox**, **lys**, **ags**, **gcode**, **bgcode**, and **f3d**. There is no Lychee mesh preview.

Thumbnails in the grid are generated in the app and cached. PNG and JPG thumbnails are resized so the long edge is at most 256 pixels. The status bar counts thumbnails that are still generating.

## Open the real file

Double-click a file, or right-click it and choose **Open**, to open it in the Windows default app. **Show in Explorer** reveals that file. Both use the catalog entry, so the app does not open an arbitrary path you type.
