import type { Browse, TagCount } from "../types";

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

export function libraryListScope(input: {
  browse: Browse;
  query: string;
  creator: string;
  selectedTagCount: number;
  selectedTypeCount: number;
}): { folder: "all" | "root" | "id"; folderId: number | null; creator: string } {
  const queryActive = /[\p{L}\p{N}]/u.test(input.query);
  const finding = queryActive || input.creator !== "" || input.selectedTagCount > 0 || input.selectedTypeCount > 0;
  const folder = finding ? "all" : input.browse.type === "root" ? "root" : "id";
  const folderId = !finding && input.browse.type === "folder" ? input.browse.id : null;
  return { folder, folderId, creator: input.creator };
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
