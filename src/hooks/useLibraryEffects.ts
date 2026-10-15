import { useEffect } from "react";
import { debugLog } from "../debugLog";
import { useFileDrag } from "./useFileDrag";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { useSessionEffects } from "./useSessionEffects";
import { useThumbPump } from "./useThumbPump";

export function useLibraryEffects<T extends
  Parameters<typeof useKeyboardShortcuts>[0] &
  Parameters<typeof useThumbPump>[0] &
  Parameters<typeof useSessionEffects>[0] &
  Parameters<typeof useFileDrag>[0] & {
    busy: string | null;
    progress: { current: number; total: number; message: string } | null;
    summary: { importedCount: number } | null;
    namePrompt: { title: string } | null;
    deleteConfirm: { name: string } | null;
    missingOpen: boolean;
    error: string | null;
  }
>(s: T) {
  useKeyboardShortcuts(s);
  const { busy, progress, summary, namePrompt, deleteConfirm, missingOpen, error } = s;
  useEffect(() => {
    debugLog("dialogs", {
      busy,
      progress: progress ? `${progress.current}/${progress.total} ${progress.message}` : null,
      summary: summary ? summary.importedCount : null,
      namePrompt: namePrompt?.title ?? null,
      deleteConfirm: deleteConfirm?.name ?? null,
      missingOpen,
      error,
    });
  }, [busy, progress, summary, namePrompt, deleteConfirm, missingOpen, error]);
  useThumbPump(s);
  useSessionEffects(s);
  return useFileDrag(s);
}
