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
  if (!folder || folder.parentId == null) return { type: "root" };
  const parent = folders.find((row) => row.id === folder.parentId);
  if (!parent) return { type: "root" };
  return { type: "folder", id: parent.id };
}

/** Drop a destination whose folder row is gone so the label and import id stay the same place. */
export function resolvePickerBrowse(folders: FolderRow[], browse: Browse): Browse {
  const place = normalizePickerBrowse(browse);
  if (place.type !== "folder") return place;
  if (folders.some((folder) => folder.id === place.id)) return place;
  return { type: "root" };
}

export function destinationDisplayPath(libraryName: string, folders: FolderRow[], browse: Browse): string {
  const crumbs = folderCrumbs(libraryName, folders, normalizePickerBrowse(browse));
  return crumbs
    .filter((crumb): crumb is Extract<(typeof crumbs)[number], { kind: "place" }> => crumb.kind === "place")
    .map((crumb) => crumb.label)
    .join(" / ");
}

export function folderIdFromTarget(target: EventTarget | null): number | null {
  if (!(target instanceof Element)) return null;
  const row = target.closest("[data-folder-id]");
  if (!row) return null;
  const id = Number(row.getAttribute("data-folder-id"));
  return Number.isInteger(id) ? id : null;
}

/** Enter follows the row under the keyboard, then the highlighted index. */
export function pickerActivationFolderId(input: {
  targetFolderId: number | null;
  focusIndex: number;
  children: FolderRow[];
}): number | null {
  if (input.targetFolderId != null && input.children.some((folder) => folder.id === input.targetFolderId)) {
    return input.targetFolderId;
  }
  if (input.focusIndex < 0 || input.focusIndex >= input.children.length) return null;
  return input.children[input.focusIndex].id;
}

export type PickerKeyAction =
  | { type: "focus"; index: number }
  | { type: "enter"; folderId: number };

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
  return null;
}
