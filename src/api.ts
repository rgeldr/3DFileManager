import { invoke } from "@tauri-apps/api/core";
import type {
  Bootstrap,
  FileRow,
  FolderRow,
  ImportSummary,
  Settings,
  ThumbJob,
} from "./types";

export const api = {
  bootstrap: () => invoke<Bootstrap>("bootstrap"),
  getSettings: () => invoke<Settings>("get_settings"),
  setLibraryRoot: (path: string) => invoke<Bootstrap>("set_library_root", { path }),
  setTheme: (theme: string) => invoke<void>("set_theme", { theme }),
  setGridSize: (gridSize: string) => invoke<void>("set_grid_size", { gridSize }),
  createFolder: (parentId: number | null, name: string) =>
    invoke<FolderRow>("create_folder", { parentId, name }),
  renameFolder: (id: number, name: string) => invoke<void>("rename_folder", { id, name }),
  deleteFolder: (id: number) => invoke<void>("delete_folder", { id }),
  moveFolder: (id: number, parentId: number | null) =>
    invoke<void>("move_folder", { id, parentId }),
  listFiles: (args: {
    folder: string;
    folderId: number | null;
    query: string;
    creator: string;
    tag: string;
    sort: string;
  }) => invoke<FileRow[]>("list_files", { args }),
  missingFiles: () => invoke<FileRow[]>("missing_files"),
  removeMissing: () => invoke<void>("remove_missing"),
  updateFile: (payload: {
    id: number;
    sortName: string;
    creator: string;
    notes: string;
    folderId: number | null;
  }) => invoke<void>("update_file", payload),
  setTags: (id: number, tags: string[]) => invoke<void>("set_tags", { id, tags }),
  addTagsUnderFolder: (folderId: number | null, tags: string[]) =>
    invoke<number>("add_tags_under_folder", { folderId, tags }),
  applyBulkMeta: (ids: number[], creator: string | null, tags: string[] | null) =>
    invoke<void>("apply_bulk_meta", { ids, creator, tags }),
  listCreators: () => invoke<string[]>("list_creators"),
  listTags: () => invoke<string[]>("list_tags"),
  importPaths: (paths: string[], folderId: number | null) =>
    invoke<ImportSummary>("import_paths", { paths, folderId }),
  cancelImport: () => invoke<void>("cancel_import"),
  recyclePaths: (paths: string[]) => invoke<string[]>("recycle_paths", { paths }),
  recycleLastImport: () => invoke<string[]>("recycle_last_import"),
  moveFiles: (ids: number[], folderId: number | null) =>
    invoke<void>("move_files", { ids, folderId }),
  deleteFiles: (ids: number[]) => invoke<void>("delete_files", { ids }),
  rescanLibrary: () =>
    invoke<{ addedFolders: number; addedFiles: number; relocated: number; missing: number }>(
      "rescan_library",
    ),
  nextThumbnail: () => invoke<ThumbJob | null>("next_thumbnail"),
  saveRenderedThumb: (id: number, png: number[]) =>
    invoke<void>("save_rendered_thumb", { id, png }),
  markThumbUnavailable: (id: number) => invoke<void>("mark_thumb_unavailable", { id }),
  clearThumbnailCache: () => invoke<void>("clear_thumbnail_cache"),
  debugLog: (line: string) => invoke<string>("debug_log", { line }),
  dragIconPath: () => invoke<string>("drag_icon_path"),
};
