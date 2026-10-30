import type { Browse, FolderRow } from "../types";
import { folderCrumbs } from "./breadcrumb";

/** Downloads has no library folders; the picker starts at the library root. */
export function normalizePickerBrowse(place: Browse): Browse {
  return place.type === "downloads" ? { type: "root" } : place;
}

export function immediateChildFolders(folders: FolderRow[], browse: Browse): FolderRow[] {
  if (browse.type === "downloads") return [];
  const parentId = browse.type === "folder" ? browse.id : null;
  return folders
    .filter((folder) => folder.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
}

export function pickerParentPlace(folders: FolderRow[], browse: Browse): Browse | null {
  if (browse.type === "root" || browse.type === "downloads") return null;
  const folder = folders.find((row) => row.id === browse.id);
  if (!folder) return { type: "root" };
  return folder.parentId == null ? { type: "root" } : { type: "folder", id: folder.parentId };
}

export function destinationDisplayPath(libraryName: string, folders: FolderRow[], browse: Browse): string {
  const crumbs = folderCrumbs(libraryName, folders, normalizePickerBrowse(browse));
  return crumbs
    .filter((crumb): crumb is Extract<(typeof crumbs)[number], { kind: "place" }> => crumb.kind === "place")
    .map((crumb) => crumb.label)
    .join(" / ");
}

export function folderHasChildren(folders: FolderRow[], folderId: number): boolean {
  return folders.some((folder) => folder.parentId === folderId);
}

export type PickerKeyAction =
  | { type: "focus"; index: number }
  | { type: "enter"; folderId: number }
  | { type: "up" };

export function pickerListKeyAction(input: {
  key: string;
  focusIndex: number;
  childCount: number;
  children: FolderRow[];
}): PickerKeyAction | null {
  const { key, focusIndex, childCount, children } = input;
  if (key === "ArrowDown") {
    if (childCount === 0) return null;
    const next = focusIndex < 0 ? 0 : Math.min(focusIndex + 1, childCount - 1);
    return next === focusIndex ? null : { type: "focus", index: next };
  }
  if (key === "ArrowUp") {
    if (childCount === 0) return null;
    const next = focusIndex < 0 ? childCount - 1 : Math.max(focusIndex - 1, 0);
    return next === focusIndex ? null : { type: "focus", index: next };
  }
  if (key === "Enter") {
    if (focusIndex < 0 || focusIndex >= children.length) return null;
    return { type: "enter", folderId: children[focusIndex].id };
  }
  if (key === "Backspace") return { type: "up" };
  return null;
}
