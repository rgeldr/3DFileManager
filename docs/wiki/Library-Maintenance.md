# Library Maintenance

These commands are on the **File** menu.

## Move the library

**Move library...** moves the library folder to a new empty folder and updates the stored path. The destination must be empty, and it cannot be inside the current library. If the old folder cannot be removed after a successful copy, the app tells you the previous path so you can delete it yourself.

## Backup and restore

**Backup library...** writes a backup into an empty folder outside the library. The backup contains the library files, `library.db`, `settings.json`, and a `manifest.json`. Thumbnail cache, `debug.log`, and import temp files are left out.

**Import backup...** asks for the backup folder, then for an empty folder where the restored files should live. On the first-launch screen, a folder you already chose is used as that destination. The restore copies the library files, replaces the catalog, and clears thumbnail status so thumbnails can be generated again.

## Rescan

**Rescan library** walks the library folder.

- Folders and supported files that are on disk but not in the catalog are added.
- A catalog file whose contents are found at a new path is updated to that path.
- A catalog file that is no longer on disk is marked missing.

## Missing files

When catalog entries are missing from disk, a banner shows the count and a **Review** button. The dialog lists those files. **Remove entries** drops them from the catalog. **Close** leaves them listed.

## Thumbnails

**Clear thumbnail cache** deletes cached thumbnails so they can be generated again. Decode failures for PNG and JPG files are recorded in `%APPDATA%\3D File Library\debug.log`.
