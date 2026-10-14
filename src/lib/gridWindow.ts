import type { GridSize } from "../types";

export const TILE_PX: Record<GridSize, number> = {
  medium: 96,
  large: 128,
  extraLarge: 256,
};

const GAP = 12;
const LABEL = 36;

export function visibleGridWindow(input: {
  count: number;
  width: number;
  height: number;
  scrollTop: number;
  tile: number;
  overscanRows?: number;
}): { start: number; end: number; padTop: number; totalHeight: number; columns: number } {
  const overscan = input.overscanRows ?? 2;
  const rowHeight = input.tile + LABEL + GAP;
  const columns = input.width > 0 ? Math.max(1, Math.floor((input.width + GAP) / (input.tile + GAP))) : 1;
  const rows = input.count === 0 ? 0 : Math.ceil(input.count / columns);
  const totalHeight = rows * rowHeight;
  if (input.count === 0) {
    return { start: 0, end: 0, padTop: 0, totalHeight: 0, columns };
  }
  if (input.width <= 0 || input.height <= 0) {
    const end = Math.min(input.count, columns * 8);
    return { start: 0, end, padTop: 0, totalHeight, columns };
  }
  const startRow = Math.max(0, Math.floor(Math.max(0, input.scrollTop) / rowHeight) - overscan);
  const visibleRows = Math.ceil(input.height / rowHeight) + overscan * 2;
  const endRow = Math.min(rows, startRow + visibleRows);
  return {
    start: Math.min(input.count, startRow * columns),
    end: Math.min(input.count, endRow * columns),
    padTop: startRow * rowHeight,
    totalHeight,
    columns,
  };
}
