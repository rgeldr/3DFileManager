import { useEffect } from "react";
import { api } from "../api";
import { deleteKeyCommand, deleteKeyFocus, focusedFolderId, isTypingTarget } from "../lib/deleteKey";
import type { Browse, FileRow } from "../types";

type RunDisk = (opts: {
  title: string;
  cancellable: boolean;
  success: string;
  cancelled: string;
  run: () => Promise<{ cancelled: boolean }>;
  after?: () => Promise<void> | void;
}) => Promise<void>;

export function useKeyboardShortcuts(s: {
  browse: Browse;
  dialogOpen: boolean;
  folderTagTarget: { folderId: number | null; name: string } | null;
  fileMenu: { fileId: number } | null;
  selected: number[];
  openDeleteFolderConfirm: (folderId: number) => void;
  files: FileRow[];
  runDiskOp: RunDisk;
  setSelected: (ids: number[]) => void;
  refreshLists: () => Promise<void>;
}) {
  const {
    browse, dialogOpen, folderTagTarget, fileMenu, selected,
    openDeleteFolderConfirm, files, runDiskOp, setSelected, refreshLists,
  } = s;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const focus = deleteKeyFocus(event.target);
      const folderId = focus === "sidebar"
        ? (focusedFolderId(event.target) ?? (browse.type === "folder" ? browse.id : null))
        : null;
      const command = deleteKeyCommand({
        key: event.key,
        typing: isTypingTarget(event.target),
        dialogOpen: Boolean(
          dialogOpen || folderTagTarget || fileMenu,
        ),
        focus,
        selectedCount: selected.length,
        folderId,
      });
      if (!command) return;
      event.preventDefault();
      if (command === "folder" && folderId != null) {
        openDeleteFolderConfirm(folderId);
        return;
      }
      const ids = selected;
      if (ids.length === 0) return;
      const one = ids.length === 1 ? files.find((file) => file.id === ids[0]) : null;
      const title = one ? `Deleting "${one.sortName}"...` : `Deleting ${ids.length} files...`;
      const success = one ? `Deleted "${one.sortName}"` : `Deleted ${ids.length} files`;
      void runDiskOp({
        title,
        cancellable: true,
        success,
        cancelled: "Delete cancelled",
        run: () => api.deleteFiles(ids),
        after: async () => {
          setSelected([]);
          await refreshLists();
        },
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    browse,
    dialogOpen,
    fileMenu,
    files,
    folderTagTarget,
    openDeleteFolderConfirm,
    refreshLists,
    runDiskOp,
    selected,
  ]);
}
