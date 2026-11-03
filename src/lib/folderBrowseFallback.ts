import type { Browse, FolderRow } from "../types";

export const FOLDER_REMOVED_NOTICE =
  "This folder was removed or moved in another window.";

export function browseAfterFolderTreeUpdate(
  browse: Browse,
  previousFolders: FolderRow[],
  nextFolders: FolderRow[],
): { browse: Browse; notice: string | null } {
  if (browse.type !== "folder") {
    return { browse, notice: null };
  }
  if (nextFolders.some((folder) => folder.id === browse.id)) {
    return { browse, notice: null };
  }
  const previous = previousFolders.find((folder) => folder.id === browse.id);
  if (
    previous?.parentId != null &&
    nextFolders.some((folder) => folder.id === previous.parentId)
  ) {
    return {
      browse: { type: "folder", id: previous.parentId },
      notice: FOLDER_REMOVED_NOTICE,
    };
  }
  return { browse: { type: "root" }, notice: FOLDER_REMOVED_NOTICE };
}
