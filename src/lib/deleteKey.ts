export type DeleteKeyFocus = "grid" | "sidebar" | "other";

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return (target.getAttribute("contenteditable") ?? "").toLowerCase() === "true";
}

export function deleteKeyFocus(target: EventTarget | null): DeleteKeyFocus {
  if (!(target instanceof Element)) return "other";
  if (target.closest(".grid-wrap")) return "grid";
  if (target.closest(".sidebar-scroll")) return "sidebar";
  return "other";
}

/** Folder row under the event target. The library root is not a deletable folder. */
export function focusedFolderId(target: EventTarget | null): number | null {
  if (!(target instanceof Element)) return null;
  const key = target.closest("[data-tree-key]")?.getAttribute("data-tree-key") ?? "";
  if (!key.startsWith("folder:")) return null;
  const id = Number(key.slice("folder:".length));
  return Number.isFinite(id) ? id : null;
}

export function deleteKeyCommand(input: {
  key: string;
  typing: boolean;
  dialogOpen: boolean;
  focus: DeleteKeyFocus;
  selectedCount: number;
  folderId: number | null;
}): "files" | "folder" | null {
  if (input.key !== "Delete") return null;
  if (input.typing || input.dialogOpen) return null;
  if (input.focus === "grid" && input.selectedCount > 0) return "files";
  if (input.focus === "sidebar" && input.folderId != null) return "folder";
  return null;
}
