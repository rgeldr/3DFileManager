/** Movement required before a press becomes a drag. */
export const DRAG_OUT_SLOP_PX = 8;

export type NativeDragDecision = "start" | "wait-for-paths" | "continue";

export interface NativeDragInput {
  buttonDown: boolean;
  pastSlop: boolean;
  outside: boolean;
  started: boolean;
  pathsReady: boolean;
  /** The browser started an image/tile drag. Cancel it and drag the files instead. */
  imageDrag?: boolean;
}

/**
 * Start the native file drag once the pointer has moved and left the window,
 * while the button is still down. Movement that stays inside remains an
 * in-app folder move. Paths are prefetched, so "wait-for-paths" only covers
 * a gesture that reaches the edge before that prepare call returns.
 */
export function nativeDragDecision(input: NativeDragInput): NativeDragDecision {
  if (!input.buttonDown || input.started) return "continue";
  const armed = input.imageDrag || (input.pastSlop && input.outside);
  if (!armed) return "continue";
  return input.pathsReady ? "start" : "wait-for-paths";
}

export function pointerPastSlop(startX: number, startY: number, x: number, y: number): boolean {
  const dx = x - startX;
  const dy = y - startY;
  return dx * dx + dy * dy >= DRAG_OUT_SLOP_PX * DRAG_OUT_SLOP_PX;
}

export function pointerOutsideWindow(x: number, y: number, width: number, height: number): boolean {
  return x <= 0 || y <= 0 || x >= width - 1 || y >= height - 1;
}

const PREVIEW_URL = /^(?:asset:|https?:|blob:|data:)/i;

/** True when a string is an image URL or a thumbnail cache path, not a library file. */
export function isPreviewDragValue(value: string): boolean {
  return PREVIEW_URL.test(value) || /[\\/]thumbs[\\/]/i.test(value);
}

export function shouldBlockHtmlDrag(target: EventTarget | null): boolean {
  if (target instanceof HTMLImageElement || target instanceof HTMLCanvasElement) return true;
  return target instanceof Element && target.closest("img, canvas, [data-file-id], .thumb, .tile, .viewer") != null;
}

/**
 * Cancel an HTML5 drag of a thumbnail, canvas, or tile.
 * The image URL is cleared and never written back onto the drag.
 */
export function suppressHtmlDrag(event: {
  target: EventTarget | null;
  preventDefault(): void;
  stopPropagation(): void;
  dataTransfer?: { clearData(): void; setData(format: string, data: string): void } | null;
}): boolean {
  if (!shouldBlockHtmlDrag(event.target)) return false;
  event.preventDefault();
  event.stopPropagation();
  event.dataTransfer?.clearData();
  return true;
}

/** Plugin payload is the library files. The icon is only the drag preview. */
export function fileDragOptions(paths: string[], iconPath: string): { item: string[]; icon: string } {
  const item = paths.filter((path) => path.length > 0 && !isPreviewDragValue(path));
  if (item.length === 0 || item.length !== paths.length) {
    throw new Error("Drag payload must be the library file paths.");
  }
  if (!iconPath || isPreviewDragValue(iconPath) || item.includes(iconPath)) {
    throw new Error("Drag preview must be the drag icon, not a file or thumbnail.");
  }
  return { item, icon: iconPath };
}

/** Catalog ids the page is allowed to drag. The path is resolved in the app. */
export function dragSources(files: { id: number }[], ids: number[]): number[] {
  const known = new Set(files.map((file) => file.id));
  return ids.filter((id) => known.has(id));
}

export function dragSourceKey(ids: number[]): string {
  return ids.join("\n");
}
