import type { GridSize } from "../types";

export const TILE_PX: Record<GridSize, number> = {
  medium: 96,
  large: 128,
  extraLarge: 256,
};

/** Matches `.grid-wrap` horizontal padding (`--space-3` on each side). */
export const WRAP_PADDING_X = 24;

/** Gap between tracks. Matches `.grid` `gap: var(--space-3)`. */
export const GRID_GAP = 12;

/**
 * Space under the thumbnail inside the tile's border box:
 * 1px border + 4px padding on each side, 4px name margin, 16px name, 14px meta.
 */
export const TILE_CHROME = 44;

export function contentWidth(clientWidth: number, paddingX = WRAP_PADDING_X): number {
  return Math.max(0, clientWidth - paddingX);
}

export function rowStride(tile: number): number {
  return tile + TILE_CHROME + GRID_GAP;
}

export function columnCount(width: number, tile: number): number {
  if (width <= 0) return 1;
  return Math.max(1, Math.floor((width + GRID_GAP) / (tile + GRID_GAP)));
}

export function visibleGridWindow(input: {
  count: number;
  width: number;
  height: number;
  scrollTop: number;
  tile: number;
  overscanRows?: number;
}): { start: number; end: number; padTop: number; totalHeight: number; columns: number } {
  const overscan = input.overscanRows ?? 2;
  const stride = rowStride(input.tile);
  const columns = columnCount(input.width, input.tile);
  const rows = input.count === 0 ? 0 : Math.ceil(input.count / columns);
  const totalHeight = rows * stride;
  if (input.count === 0) {
    return { start: 0, end: 0, padTop: 0, totalHeight: 0, columns };
  }
  if (input.width <= 0 || input.height <= 0) {
    const end = Math.min(input.count, columns * 8);
    return { start: 0, end, padTop: 0, totalHeight, columns };
  }
  const startRow = Math.max(0, Math.floor(Math.max(0, input.scrollTop) / stride) - overscan);
  const visibleRows = Math.ceil(input.height / stride) + overscan * 2;
  const endRow = Math.min(rows, startRow + visibleRows);
  return {
    start: Math.min(input.count, startRow * columns),
    end: Math.min(input.count, endRow * columns),
    padTop: startRow * stride,
    totalHeight,
    columns,
  };
}
