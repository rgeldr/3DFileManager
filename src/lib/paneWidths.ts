export const SIDEBAR_MIN = 180;
export const SIDEBAR_MAX = 640;
export const INSPECTOR_MIN = 240;
export const INSPECTOR_MAX = 560;
export const INSPECTOR_RAIL_WIDTH = 40;

function clampRange(width: number, min: number, absoluteMax: number, windowFraction: number, windowWidth: number): number {
  const max = Math.min(absoluteMax, Math.floor(windowWidth * windowFraction));
  const cap = Math.max(min, max);
  return Math.min(cap, Math.max(min, Math.round(width)));
}

export function clampSidebar(width: number, windowWidth: number): number {
  return clampRange(width, SIDEBAR_MIN, SIDEBAR_MAX, 0.5, windowWidth);
}

export function clampInspector(width: number, windowWidth: number): number {
  return clampRange(width, INSPECTOR_MIN, INSPECTOR_MAX, 0.45, windowWidth);
}
