import type { Browse } from "../types";
import { pushFolder, type FolderHistory } from "./folderHistory";

export const MISSING_FILE_MESSAGE = "That file is no longer in the library.";
export const MISSING_FOLDER_MESSAGE = "That folder is no longer in the library.";

export type ContainingFolderResult =
  | { ok: true; place: Browse }
  | { ok: false; message: string };

/** Folder the file lives in. Root files browse the library root. A missing folder is refused. */
export function containingFolderPlace(
  file: { folderId: number | null } | undefined,
  folders: { id: number }[],
): ContainingFolderResult {
  if (!file) return { ok: false, message: MISSING_FILE_MESSAGE };
  if (file.folderId == null) return { ok: true, place: { type: "root" } };
  if (!folders.some((folder) => folder.id === file.folderId)) {
    return { ok: false, message: MISSING_FOLDER_MESSAGE };
  }
  return { ok: true, place: { type: "folder", id: file.folderId } };
}

/** Same history step as choosing a folder in the sidebar. Staying put keeps Back and Forward. */
export function browseContainingFolder(history: FolderHistory, place: Browse): FolderHistory {
  return pushFolder(history, place);
}
