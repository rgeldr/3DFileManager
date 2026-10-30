import type { Browse, FolderRow, LibrarySort, SearchScope, SortDirection, SortField, TagCount } from "../types";

export type TagFilterKeyAction = "close" | "up" | "down" | "toggle" | "type";

export function filterTagOptions(tags: TagCount[], query: string): TagCount[] {
  const needle = query.trim().toLowerCase();
  const sorted = [...tags].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  if (!needle) return sorted;
  return sorted.filter((tag) => tag.name.toLowerCase().includes(needle));
}

export function toggleTagId(ids: number[], id: number): number[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

export function tagFilterBadge(count: number): string {
  return count > 0 ? `Tags (${count})` : "Tags";
}

export function browseIsFiltered(input: {
  query: string;
  creator: string;
  selectedTagCount: number;
  selectedTypeCount: number;
}): boolean {
  const queryActive = /[\p{L}\p{N}]/u.test(input.query);
  return queryActive || input.creator !== "" || input.selectedTagCount > 0 || input.selectedTypeCount > 0;
}

export function defaultSortDirection(field: SortField): SortDirection {
  return field === "name" || field === "creator" ? "asc" : "desc";
}

export function nextSort(current: LibrarySort, field: SortField): LibrarySort {
  if (current.field !== field) {
    return { field, direction: defaultSortDirection(field) };
  }
  return { field, direction: current.direction === "asc" ? "desc" : "asc" };
}

export function sortFromDropdown(field: SortField): LibrarySort {
  return { field, direction: defaultSortDirection(field) };
}

export function libraryRefreshKey(input: {
  browse: Browse;
  query: string;
  creator: string;
  selectedTagIds: number[];
  selectedTypeIds: string[];
  tagMatch: string;
  sort: LibrarySort;
  scope: SearchScope;
}): string {
  return JSON.stringify({
    folder: input.browse.type === "folder" ? input.browse.id : input.browse.type,
    query: input.query,
    creator: input.creator,
    tags: [...input.selectedTagIds].sort((a, b) => a - b),
    types: [...input.selectedTypeIds].sort(),
    tagMatch: input.tagMatch,
    sort: input.sort,
    scope: input.scope,
  });
}

/** Entire-library searches stop here so a 100,000-file catalog does not all land in the grid. */
export const LIBRARY_SEARCH_LIMIT = 5000;

/** Tag list scope. Entire library counts every file. Current folder uses the grid's folder, and a zero count still keeps the tag. */
export function tagCountScope(input: {
  listed: { folder: "all" | "root" | "id" | "subtree" | "downloads"; folderId: number | null; creator: string };
  query: string;
  scope: SearchScope;
}): { folder: "all" | "root" | "id" | "subtree" | "downloads"; folderId: number | null; query: string; creator: string } {
  if (input.scope === "library") {
    return { folder: "all", folderId: null, query: input.query, creator: input.listed.creator };
  }
  return {
    folder: input.listed.folder,
    folderId: input.listed.folderId,
    query: input.query,
    creator: input.listed.creator,
  };
}

export function librarySearchLimit(folder: "all" | "root" | "id" | "subtree" | "downloads"): number | undefined {
  return folder === "all" ? LIBRARY_SEARCH_LIMIT : undefined;
}

export function truncateLibraryList<T>(rows: T[], limit: number | undefined): { rows: T[]; truncated: boolean } {
  if (limit == null || rows.length <= limit) return { rows, truncated: false };
  return { rows: rows.slice(0, limit), truncated: true };
}

export function truncatedSearchMessage(limit: number): string {
  return `Showing the first ${limit} matches. Narrow the search to see the rest.`;
}

export function libraryListScope(input: {
  browse: Browse;
  query: string;
  creator: string;
  selectedTagCount: number;
  selectedTypeCount: number;
  scope: SearchScope;
}): { folder: "all" | "root" | "id" | "subtree" | "downloads"; folderId: number | null; creator: string } {
  if (input.browse.type === "downloads") {
    return { folder: "downloads", folderId: null, creator: "" };
  }
  const filtering = browseIsFiltered({
    query: input.query,
    creator: input.creator,
    selectedTagCount: input.selectedTagCount,
    selectedTypeCount: input.selectedTypeCount,
  });
  if (!filtering) {
    if (input.browse.type === "root") {
      return { folder: "root", folderId: null, creator: input.creator };
    }
    return { folder: "id", folderId: input.browse.id, creator: input.creator };
  }
  if (input.scope === "folder" && input.browse.type === "folder") {
    return { folder: "subtree", folderId: input.browse.id, creator: input.creator };
  }
  return { folder: "all", folderId: null, creator: input.creator };
}

export function centerSubfolders(input: {
  folders: FolderRow[];
  browse: Browse;
  query: string;
  creator: string;
  selectedTagCount: number;
  selectedTypeCount: number;
}): FolderRow[] {
  if (input.browse.type === "downloads") {
    return [];
  }
  if (
    browseIsFiltered({
      query: input.query,
      creator: input.creator,
      selectedTagCount: input.selectedTagCount,
      selectedTypeCount: input.selectedTypeCount,
    })
  ) {
    return [];
  }
  const parentId = input.browse.type === "folder" ? input.browse.id : null;
  return input.folders
    .filter((folder) => folder.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
}

export function gridEmptyMessage(input: {
  selectedTagCount: number;
  selectedTypeCount: number;
  creator: string;
  query: string;
}): string {
  const queryActive = /[\p{L}\p{N}]/u.test(input.query);
  const other = queryActive || input.creator !== "";
  if (input.selectedTagCount > 0 && input.selectedTypeCount === 0 && !other) return "No files match the selected tags";
  if (input.selectedTypeCount > 0 && input.selectedTagCount === 0 && !other) return "No files match the selected types";
  if (input.selectedTagCount > 0 || input.selectedTypeCount > 0 || other) return "No files match the current filters";
  return "This folder is empty. Drop files here to import them.";
}

export function moveTagHighlight(index: number, length: number, direction: "up" | "down"): number {
  if (length <= 0) return 0;
  if (direction === "down") return Math.min(index + 1, length - 1);
  return Math.max(index - 1, 0);
}

export function tagFilterKeyAction(input: {
  key: string;
  inSearch: boolean;
  highlight: number;
  length: number;
}): TagFilterKeyAction {
  if (input.key === "Escape") return "close";
  if (input.key === "ArrowDown") return "down";
  if (input.key === "ArrowUp") return "up";
  if (input.key === " " || input.key === "Spacebar") {
    const highlighted = input.highlight >= 0 && input.highlight < input.length;
    if (input.inSearch || !highlighted) return "type";
    return "toggle";
  }
  return "type";
}
