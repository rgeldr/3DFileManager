# Importing

The app copies or hard-links files into the library folder and adds them to the catalog. A file on the same drive is hard-linked. A file on another drive is copied.

Supported files are `stl`, `3mf`, `obj`, `gcode`, `bgcode`, `ctb`, `chitubox`, `ags`, `lys`, `png`, `jpg`, `jpeg`, `pdf`, `txt`, `step`, `stp`, `f3d`, `md`, and `scad`.

Archives are `zip`, `rar`, and `7z`. Files inside an archive are imported the same way. The archive itself is not stored as a library file.

## Drop files on the window

1. Drag files or folders from Explorer onto the 3D File Library window.
2. Wait for the import progress dialog. You can cancel it.
3. When it finishes, the summary shows how many files were imported, how many were duplicates, and how many were left in place.

You can also use **File > Import folder...** or **File > Import archive...**.

## After the import

The summary can set a creator and tags on the files imported in that batch. Type a tag and press Enter. Leave the fields blank to leave those files unchanged. Duplicates already in the library are not updated.

Then choose:

- **Keep originals** to leave the source files where they were.
- The Recycle Bin button, when it is shown, to move the imported originals and the duplicate originals to the Recycle Bin.

Unsupported files and files that failed to import stay in the source folder. The source folder itself is not recycled.

If the summary says duplicate checking continues in the background, the app is still hashing files that were linked in quickly. A later duplicate is dropped when that pass finishes.

## What a duplicate is

A file is a duplicate when its contents match a file already in the library, even if the name differs. The duplicate is not imported again.

## Folders inside an import

Folders in the drop are recreated under the folder you had selected, including nested folders. File names that Windows will not accept are sanitized, and a name that already exists gets a numeric suffix.
