export type DownloadSelectMode = "replace" | "toggle" | "range";

export function selectDownloadPath(
  orderedPaths: string[],
  selected: string[],
  path: string,
  mode: DownloadSelectMode,
): string[] {
  if (mode === "toggle") {
    return selected.includes(path) ? selected.filter((item) => item !== path) : [...selected, path];
  }
  if (mode === "range" && selected.length > 0) {
    const anchor = selected[selected.length - 1];
    const start = orderedPaths.indexOf(anchor);
    const end = orderedPaths.indexOf(path);
    if (start >= 0 && end >= 0) {
      const [from, to] = start < end ? [start, end] : [end, start];
      return orderedPaths.slice(from, to + 1);
    }
  }
  return [path];
}

/** Right-click on an unselected row replaces the selection; an already-selected row keeps it. */
export function contextMenuDownloadSelection(selected: string[], path: string): string[] {
  return selected.includes(path) ? selected : [path];
}

export function downloadSelectMode(event: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }): DownloadSelectMode {
  if (event.shiftKey) return "range";
  if (event.metaKey || event.ctrlKey) return "toggle";
  return "replace";
}
