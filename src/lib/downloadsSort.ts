import type { DownloadRow } from "../types";

export type DownloadSortField = "path" | "name" | "size" | "modified";
export type DownloadSortDirection = "asc" | "desc";

export interface DownloadSort {
  field: DownloadSortField;
  direction: DownloadSortDirection;
}

export const DEFAULT_DOWNLOAD_SORT: DownloadSort = { field: "path", direction: "asc" };

export function compareDownloads(a: DownloadRow, b: DownloadRow, sort: DownloadSort): number {
  const dir = sort.direction === "asc" ? 1 : -1;
  const tieName = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  if (sort.field === "path") {
    const pathCmp = a.relativeDir.localeCompare(b.relativeDir, undefined, { numeric: true, sensitivity: "base" });
    if (pathCmp !== 0) return pathCmp * dir;
    return tieName * dir;
  }
  if (sort.field === "name") {
    const nameCmp = tieName;
    if (nameCmp !== 0) return nameCmp * dir;
    return a.relativeDir.localeCompare(b.relativeDir, undefined, { numeric: true, sensitivity: "base" }) * dir;
  }
  if (sort.field === "size") {
    if (a.sizeBytes !== b.sizeBytes) return (a.sizeBytes - b.sizeBytes) * dir;
    return tieName;
  }
  if (a.mtime !== b.mtime) return (a.mtime - b.mtime) * dir;
  return tieName;
}

export function sortedDownloadRows(rows: DownloadRow[], sort: DownloadSort): DownloadRow[] {
  return [...rows].sort((a, b) => compareDownloads(a, b, sort));
}

export function orderedDownloadPaths(rows: DownloadRow[], sort: DownloadSort): string[] {
  return sortedDownloadRows(rows, sort).map((row) => row.absolutePath);
}
