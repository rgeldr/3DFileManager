export type GridSize = "medium" | "large" | "extraLarge";

export interface Settings {
  libraryRoot: string | null;
  theme: "dark" | "light";
  gridSize: GridSize;
}

export interface FolderRow {
  id: number;
  parentId: number | null;
  name: string;
  relpath: string;
  sortOrder: number;
}

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
  thumbStatus: "none" | "ok" | "unavailable";
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
  recyclePaths: string[];
}

export interface ThumbJob {
  kind: "done" | "skip" | "render";
  id: number;
  absolutePath: string;
  ext: string;
  sizeBytes: number;
}

export type Browse =
  | { type: "all" }
  | { type: "root" }
  | { type: "folder"; id: number };
