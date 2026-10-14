import type { FileRow } from "../types";

/** Movement required before a press becomes a drag. */
export const DRAG_OUT_SLOP_PX = 8;

export type NativeDragDecision = "start" | "wait-for-paths" | "continue";

export interface NativeDragInput {
  buttonDown: boolean;
  pastSlop: boolean;
  outside: boolean;
  started: boolean;
  pathsReady: boolean;
}

/**
 * Start the native file drag once the pointer has moved and left the window,
 * while the button is still down. Movement that stays inside remains an
 * in-app folder move. Paths are prefetched, so "wait-for-paths" only covers
 * a gesture that reaches the edge before that prepare call returns.
 */
export function nativeDragDecision(input: NativeDragInput): NativeDragDecision {
  if (!input.buttonDown || input.started || !input.pastSlop || !input.outside) return "continue";
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

export function shouldBlockHtmlDrag(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("[data-file-id]") != null;
}

export function dragSources(files: Pick<FileRow, "id" | "absolutePath" | "originalName" | "ext">[], ids: number[]) {
  const byId = new Map(files.map((file) => [file.id, file]));
  const sources = [];
  for (const id of ids) {
    const file = byId.get(id);
    if (!file) continue;
    sources.push({ path: file.absolutePath, fileName: file.originalName, ext: file.ext });
  }
  return sources;
}

export function dragSourceKey(sources: { path: string; fileName: string; ext: string }[]): string {
  return sources.map((source) => `${source.path}\n${source.fileName}\n${source.ext}`).join("\n");
}
