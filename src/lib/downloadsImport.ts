import type { Browse, FolderRow } from "../types";
import type { FolderHistory } from "./folderHistory";

export function defaultImportDestination(history: FolderHistory): Browse {
  for (let index = history.back.length - 1; index >= 0; index -= 1) {
    const place = history.back[index];
    if (place.type !== "downloads") return place;
  }
  return { type: "root" };
}

export function browseToFolderId(place: Browse): number | null {
  return place.type === "folder" ? place.id : null;
}

export function folderLabel(folders: FolderRow[], place: Browse, libraryName: string): string {
  if (place.type === "root") return libraryName;
  if (place.type === "downloads") return "Downloads";
  return folders.find((folder) => folder.id === place.id)?.name ?? "Folder";
}
