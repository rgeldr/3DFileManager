import type { FolderRow } from "../types";

export function folderDisplayName(
  folderId: number | null,
  folders: FolderRow[],
  libraryName: string,
): string {
  if (folderId === null) return libraryName;
  return folders.find((item) => item.id === folderId)?.name ?? "Folder";
}

export function rescanTitle(folderId: number | null, folders: FolderRow[], libraryName: string): string {
  const name = folderId == null ? libraryName : folders.find((item) => item.id === folderId)?.name ?? "folder";
  return `Rescanning "${name}"...`;
}

export function creatorSelectOptions(creatorOptions: string[], creator: string): string[] {
  return creatorOptions.includes(creator) || creator === ""
    ? creatorOptions
    : [...creatorOptions, creator];
}

export function browseFromSidebarKey(key: string): import("../types").Browse {
  if (key === "downloads") return { type: "downloads" };
  if (key === "root") return { type: "root" };
  return { type: "folder", id: Number(key.slice(7)) };
}
