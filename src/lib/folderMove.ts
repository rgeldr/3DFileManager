import type { FolderRow } from "../types";

export const FOLDER_ROOT_DROP_ID = "root";

export function isFolderUnderAncestor(
  folders: FolderRow[],
  ancestorId: number,
  folderId: number | null,
): boolean {
  let current = folderId;
  while (current != null) {
    if (current === ancestorId) return true;
    current = folders.find((f) => f.id === current)?.parentId ?? null;
  }
  return false;
}

/** Returns the drop target id when legal, or null when the move should not run. */
export function legalFolderDrop(
  folders: FolderRow[],
  dragFolderId: number,
  target: string | null,
): string | null {
  if (!target) return null;
  const dropFolderId = target === FOLDER_ROOT_DROP_ID ? null : Number(target);
  if (target !== FOLDER_ROOT_DROP_ID && !Number.isFinite(dropFolderId)) return null;

  const currentParent = folders.find((f) => f.id === dragFolderId)?.parentId ?? null;
  if (currentParent === dropFolderId) return null;

  if (dropFolderId === dragFolderId) return null;
  if (dropFolderId != null && isFolderUnderAncestor(folders, dragFolderId, dropFolderId)) return null;

  return target;
}
