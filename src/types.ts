export type GridSize = "medium" | "large" | "extraLarge";

export interface Settings {
  libraryRoot: string | null;
  theme: "dark" | "light";
  gridSize: GridSize;
  sidebarWidth: number;
  inspectorWidth: number;
  previewHeight: number;
  thumbRetry: number;
}

export interface DragReport {
  original: string;
  simplified: string;
  length: number;
  extendedPrefix: boolean;
  hasForwardSlash: boolean;
  exists: boolean;
  staged: boolean;
  dragPath: string;
  error: string | null;
}

export interface PreparedDrag {
  paths: string[];
  skipped: string[];
  reports: DragReport[];
  iconBytes: number;
}

export interface FolderRow {
  id: number;
  parentId: number | null;
  name: string;
  relpath: string;
  sortOrder: number;
}

export interface TagCount {
  id: number;
  name: string;
  fileCount: number;
}

export type TagMatchMode = "any" | "all";

export interface FileRow {
  id: number;
  originalName: string;
  sortName: string;
  storedRelpath: string;
  ext: string;
  sizeBytes: number;
  sha256: string;
  folderId: number | null;
  creator: string;
  notes: string;
  sourceArchive: string | null;
  importedAt: number;
  thumbStatus: "none" | "ok" | "unavailable" | "unhashed";
  missing: boolean;
  tags: string[];
  absolutePath: string;
  thumbPath: string | null;
}

export interface Bootstrap {
  settings: Settings;
  folders: FolderRow[];
  missingCount: number;
}

export interface ImportSummary {
  importedIds: number[];
  importedCount: number;
  duplicateCount: number;
  unsupportedCount: number;
  failed: string[];
  recycleCount: number;
  leftInPlace: number;
  cancelled: boolean;
  pendingHashCount: number;
}

export interface ThumbJob {
  kind: "done" | "skip" | "render";
  id: number;
  absolutePath: string;
  ext: string;
  sizeBytes: number;
}

export type Browse =
  | { type: "root" }
  | { type: "folder"; id: number };
