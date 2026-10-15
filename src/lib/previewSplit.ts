/** Preview pane limits. The splitter thickness matches `--space-1`. */
export const PREVIEW_MIN = 120;
export const DETAILS_MIN = 150;
export const PREVIEW_SPLITTER = 4;
export const DEFAULT_PREVIEW_HEIGHT = 240;
export const PREVIEW_KEY_STEP = 16;
export const PREVIEW_MAX = 4000;

export function previewHeightBounds(paneHeight: number): { min: number; max: number } {
  const room = Math.max(0, Math.floor(paneHeight) - PREVIEW_SPLITTER);
  if (room <= 0) return { min: 0, max: 0 };
  const aboveDetails = room - DETAILS_MIN;
  if (aboveDetails >= PREVIEW_MIN) return { min: PREVIEW_MIN, max: aboveDetails };
  if (room <= DETAILS_MIN) return { min: 0, max: room };
  return { min: aboveDetails, max: aboveDetails };
}

export function clampPreviewHeight(height: number, paneHeight: number): number {
  const { min, max } = previewHeightBounds(paneHeight);
  return Math.min(max, Math.max(min, Math.round(height)));
}

/** Height written to settings. Short panes can display less than the saved minimum. */
export function persistPreviewHeight(height: number, paneHeight: number): number {
  const shown = paneHeight > 0 ? clampPreviewHeight(height, paneHeight) : Math.round(height);
  if (!Number.isFinite(shown)) return DEFAULT_PREVIEW_HEIGHT;
  return Math.min(PREVIEW_MAX, Math.max(PREVIEW_MIN, shown));
}

export function resetPreviewHeight(paneHeight: number): number {
  return persistPreviewHeight(DEFAULT_PREVIEW_HEIGHT, paneHeight);
}

export function nudgePreviewHeight(height: number, paneHeight: number, direction: 1 | -1): number {
  const current = paneHeight > 0 ? clampPreviewHeight(height, paneHeight) : height;
  return persistPreviewHeight(current + direction * PREVIEW_KEY_STEP, paneHeight);
}

/** Live height while dragging. May sit under the saved minimum when the pane is short. */
export function dragPreviewHeight(origin: number, deltaY: number, paneHeight: number): number {
  const next = origin + deltaY;
  return paneHeight > 0 ? clampPreviewHeight(next, paneHeight) : Math.round(next);
}
