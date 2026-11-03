export type LibraryChangeKind = "files" | "folders" | "tags" | "settings" | "all";

export type LibraryChangedPayload = {
  kind: LibraryChangeKind;
  sourceWindow: string;
};

export function shouldIgnoreLibraryChanged(
  payload: LibraryChangedPayload,
  windowLabel: string,
): boolean {
  return payload.sourceWindow === windowLabel;
}

export function mergeLibraryChangeKinds(
  current: LibraryChangeKind | null,
  next: LibraryChangeKind,
): LibraryChangeKind {
  if (!current) return next;
  if (current === "all" || next === "all") return "all";
  if (current === next) return current;
  if (
    (current === "folders" && next === "files") ||
    (current === "files" && next === "folders")
  ) {
    return "all";
  }
  if (current === "settings" || next === "settings") {
    if (current === "settings" && next === "settings") return "settings";
    return "all";
  }
  if (current === "tags" || next === "tags") {
    if (current === "tags" && next === "tags") return "tags";
    return "all";
  }
  return "all";
}

export function debounceLibraryChanged(
  schedule: (callback: () => void) => number,
  clear: (id: number) => void,
  waitMs: number,
) {
  let timer: number | null = null;
  let pending: LibraryChangeKind | null = null;
  return {
    push(kind: LibraryChangeKind, run: (merged: LibraryChangeKind) => void) {
      pending = mergeLibraryChangeKinds(pending, kind);
      if (timer != null) clear(timer);
      timer = schedule(() => {
        timer = null;
        const merged = pending ?? kind;
        pending = null;
        run(merged);
      });
    },
    cancel() {
      if (timer != null) clear(timer);
      timer = null;
      pending = null;
    },
  };
}
