export const DRAG_ICON_KIND = "drag.png";

export function iconForDrag(fallbackPath: string): string {
  return fallbackPath;
}

export function pathLooksUnsafeForDrag(path: string): boolean {
  return path.startsWith("\\\\?\\") || [...path].length > 259;
}
