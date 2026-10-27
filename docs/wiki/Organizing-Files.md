# Organizing Files

## Folders

Right-click a folder in the tree:

- **New folder** creates a folder inside it. The same command on the library root creates a top-level folder.
- **Rename** changes the folder name and the folder on disk.
- **Delete** removes an empty folder. The library root cannot be deleted. The confirm dialog states that this cannot be undone.
- **Tag contents…** adds tags to every file in that folder and its subfolders. Tags already on those files stay.
- **Set Creator…** sets the creator on files in that folder. Check **Include subfolders** to include nested folders. The field suggests creators already in the library.

Drag a folder onto another folder, or onto the library root, to move it. You cannot drop a folder onto itself or onto one of its own subfolders.

The buttons above the tree do the same for the folder that is open. **New folder** on the library root creates a top-level folder. **Rename** and **Delete** do nothing while the library root is selected.

Press Delete to move the selected files to the Recycle Bin. With a folder row focused in the tree, Delete opens the empty-folder confirm dialog.

Drag selected files onto a folder in the tree to move them there.

## One file

Select a file. In the details pane, edit:

- **Sort name**. New files start from the file name, with underscores turned into spaces and the extension removed. The grid shows the sort name plus the extension.
- **Creator**
- **Folder**, which moves the file when you save
- **Tags**. Click a tag to remove it. Type a tag and press Enter to add it. Suggestions come from tags already in the library.
- **Notes**

Click **Save**. Click **Delete** to move that file to the Recycle Bin and remove it from the catalog.

## Several files

Select more than one file, then right-click the selection:

- **Set Creator…** sets the creator on the selected files.
- **Add tags…** adds tags to the selected files and keeps tags they already have.

**Open**, **Show in Explorer**, and **Open in…** act on the file you right-clicked. **Open in…** starts a program from **View > External programs…** and passes that file. Each program is a name and the path to its `.exe`. If none are configured, the submenu shows **Configure programs…**.

## Drag a file out

Drag a file from the grid to Explorer or a slicer. If the library path is too long for the Windows shell, the app stages a short copy or hard link under the temp folder and drags that instead. If the drag cannot be prepared, a dialog lists the reason.
