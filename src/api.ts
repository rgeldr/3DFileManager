import { invoke } from "@tauri-apps/api/core";
import type {
  Bootstrap,
  FileRow,
  LibraryStats,
  FolderRow,
  TagCount,
  TypeCount,
  ImportSummary,
  PreparedDrag,
  Settings,
  ThumbJob,
} from "./types";

export type DiskOutcome = { cancelled: boolean };

export const api = {
  bootstrap: () => invoke<Bootstrap>("bootstrap"),
  libraryStats: () => invoke<LibraryStats>("library_stats"),
  getSettings: () => invoke<Settings>("get_settings"),
  setLibraryRoot: (path: string) => invoke<Bootstrap>("set_library_root", { path }),
  moveLibraryRoot: (path: string) => invoke<DiskOutcome>("move_library_root", { path }),
  setTheme: (theme: string) => invoke<void>("set_theme", { theme }),
  setGridSize: (gridSize: string) => invoke<void>("set_grid_size", { gridSize }),
  setSearchScope: (searchScope: string) => invoke<void>("set_search_scope", { searchScope }),
  setPaneWidths: (sidebarWidth: number, inspectorWidth: number) =>
    invoke<void>("set_pane_widths", { sidebarWidth, inspectorWidth }),
  setPreviewHeight: (previewHeight: number) =>
    invoke<void>("set_preview_height", { previewHeight }),
  setInspectorPinned: (inspectorPinned: boolean) =>
    invoke<void>("set_inspector_pinned", { inspectorPinned }),
  setSidebarPinned: (sidebarPinned: boolean) =>
    invoke<void>("set_sidebar_pinned", { sidebarPinned }),
  revealFolder: (folderId: number | null) => invoke<void>("reveal_folder", { folderId }),
  rescanFolder: (folderId: number) =>
    invoke<{
      addedFolders: number;
      addedFiles: number;
      relocated: number;
      missing: number;
      cancelled: boolean;
    }>("rescan_folder", { folderId }),
  createFolder: (parentId: number | null, name: string) =>
    invoke<FolderRow>("create_folder", { parentId, name }),
  renameFolder: (id: number, name: string) => invoke<DiskOutcome>("rename_folder", { id, name }),
  deleteFolder: (id: number) => invoke<DiskOutcome>("delete_folder", { id }),
  moveFolder: (id: number, parentId: number | null) =>
    invoke<DiskOutcome>("move_folder", { id, parentId }),
  listFiles: (args: {
    folder: string;
    folderId: number | null;
    query: string;
    creator: string;
    tag: string;
    tagIds: number[];
    tagMatch: "any" | "all";
    exts: string[];
    sort: string;
    sortDirection: string;
    limit?: number;
    offset?: number;
  }) => invoke<FileRow[]>("list_files", { args }),
  missingFiles: () => invoke<FileRow[]>("missing_files"),
  removeMissing: () => invoke<void>("remove_missing"),
  updateFile: (payload: {
    id: number;
    sortName: string;
    creator: string;
    notes: string;
    folderId: number | null;
  }) => invoke<DiskOutcome>("update_file", payload),
  setTags: (id: number, tags: string[]) => invoke<void>("set_tags", { id, tags }),
  addTagsUnderFolder: (folderId: number | null, tags: string[]) =>
    invoke<number>("add_tags_under_folder", { folderId, tags }),
  addTagsToFiles: (ids: number[], tags: string[]) =>
    invoke<number>("add_tags_to_files", { ids, tags }),
  applyBulkMeta: (ids: number[], creator: string | null, tags: string[] | null) =>
    invoke<void>("apply_bulk_meta", { ids, creator, tags }),
  countFilesForScope: (folderId: number | null, includeSubfolders: boolean) =>
    invoke<number>("count_files_for_scope", { folderId, includeSubfolders }),
  setCreatorUnderFolder: (folderId: number | null, creator: string, includeSubfolders: boolean) =>
    invoke<number>("set_creator_under_folder", { folderId, creator, includeSubfolders }),
  listCreators: (args?: { folder: string; folderId: number | null }) =>
    invoke<string[]>("list_creators", { args: args ?? { folder: "", folderId: null } }),
  listTags: () => invoke<string[]>("list_tags"),
  listTagCounts: (args: {
    folder: string;
    folderId: number | null;
    query: string;
    creator: string;
    exts: string[];
  }) => invoke<TagCount[]>("list_tag_counts", { args }),
  listTypeCounts: (args: {
    folder: string;
    folderId: number | null;
    query: string;
    creator: string;
    tagIds: number[];
    tagMatch: "any" | "all";
  }) => invoke<TypeCount[]>("list_type_counts", { args }),
  importPaths: (paths: string[], folderId: number | null) =>
    invoke<ImportSummary>("import_paths", { paths, folderId }),
  cancelImport: () => invoke<void>("cancel_import"),
  cancelDiskOp: () => invoke<void>("cancel_disk_op"),
  recyclePaths: (paths: string[]) =>
    invoke<{ failed: string[]; cancelled: boolean }>("recycle_paths", { paths }),
  recycleLastImport: () =>
    invoke<{ failed: string[]; cancelled: boolean }>("recycle_last_import"),
  moveFiles: (ids: number[], folderId: number | null) =>
    invoke<DiskOutcome>("move_files", { ids, folderId }),
  deleteFiles: (ids: number[]) => invoke<DiskOutcome>("delete_files", { ids }),
  rescanLibrary: () =>
    invoke<{
      addedFolders: number;
      addedFiles: number;
      relocated: number;
      missing: number;
      cancelled: boolean;
    }>("rescan_library"),
  exportLibraryBackup: (path: string) =>
    invoke<DiskOutcome>("export_library_backup", { path }),
  restoreLibraryBackup: (backupPath: string, libraryPath: string) =>
    invoke<DiskOutcome>("restore_library_backup", { backupPath, libraryPath }),
  nextThumbnail: () => invoke<ThumbJob | null>("next_thumbnail"),
  pendingThumbnailCount: () => invoke<number>("pending_thumbnail_count"),
  saveRenderedThumb: (id: number, png: number[]) =>
    invoke<void>("save_rendered_thumb", { id, png }),
  markThumbUnavailable: (id: number) => invoke<void>("mark_thumb_unavailable", { id }),
  releaseRenderingThumb: (id: number) => invoke<void>("release_rendering_thumb", { id }),
  clearThumbnailCache: () => invoke<void>("clear_thumbnail_cache"),
  debugLog: (line: string) => invoke<string>("debug_log", { line }),
  dragIconPath: () => invoke<string>("drag_icon_path"),
  prepareDragPaths: (ids: number[], iconPath: string) =>
    invoke<PreparedDrag>("prepare_drag_paths", { ids, iconPath }),
  openInDefaultApp: (fileId: number) => invoke<void>("open_in_default_app", { fileId }),
  revealFile: (fileId: number) => invoke<void>("reveal_file", { fileId }),
  textPreview: (fileId: number) => invoke<string>("text_preview", { fileId }),
};
