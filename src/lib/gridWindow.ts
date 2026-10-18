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

/** Track width after CSS grid stretches `minmax(tile, 1fr)` columns. */
export function columnWidth(width: number, tile: number): number {
  const columns = columnCount(width, tile);
  if (width <= 0) return tile;
  return (width - (columns - 1) * GRID_GAP) / columns;
}

export type GridRect = { x: number; y: number; width: number; height: number };

export function normalizeRect(x1: number, y1: number, x2: number, y2: number): GridRect {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

export function clientToContent(client: number, origin: number, scroll: number, padding: number): number {
  return client - origin - padding + scroll;
}

export function contentToClient(content: number, origin: number, scroll: number, padding: number): number {
  return content + origin + padding - scroll;
}

export function rectsIntersect(a: GridRect, b: GridRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** File indexes whose tile border boxes meet `rect` in content coordinates. */
export function marqueeHitIndices(input: {
  count: number;
  width: number;
  tile: number;
  rect: GridRect;
}): number[] {
  if (input.count <= 0 || input.rect.width <= 0 || input.rect.height <= 0 || input.width <= 0) return [];
  const columns = columnCount(input.width, input.tile);
  const stride = rowStride(input.tile);
  const colW = columnWidth(input.width, input.tile);
  const rowH = input.tile + TILE_CHROME;
  const cell = colW + GRID_GAP;
  const rows = Math.ceil(input.count / columns);
  const firstRow = Math.max(0, Math.floor(input.rect.y / stride));
  const lastRow = Math.min(rows - 1, Math.floor((input.rect.y + input.rect.height) / stride));
  const hits: number[] = [];
  for (let row = firstRow; row <= lastRow; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const index = row * columns + col;
      if (index >= input.count) break;
      const tileRect = { x: col * cell, y: row * stride, width: colW, height: rowH };
      if (rectsIntersect(tileRect, input.rect)) hits.push(index);
    }
  }
  return hits;
}

export function mergeSelection(base: number[], hits: number[], additive: boolean): number[] {
  if (!additive) return hits;
  const seen = new Set(base);
  const next = base.slice();
  for (const id of hits) {
    if (seen.has(id)) continue;
    seen.add(id);
    next.push(id);
  }
  return next;
}

export const ROW_PX = 32;
export const DETAILS_HEADER_PX = ROW_PX;

export function visibleRowWindow(input: {
  count: number;
  height: number;
  scrollTop: number;
  overscanRows?: number;
}): { start: number; end: number; padTop: number; totalHeight: number } {
  const overscan = input.overscanRows ?? 8;
  const stride = ROW_PX;
  const totalHeight = input.count * stride;
  if (input.count === 0) {
    return { start: 0, end: 0, padTop: 0, totalHeight: 0 };
  }
  if (input.height <= 0) {
    const end = Math.min(input.count, 24);
    return { start: 0, end, padTop: 0, totalHeight };
  }
  const startRow = Math.max(0, Math.floor(Math.max(0, input.scrollTop) / stride) - overscan);
  const visibleRows = Math.ceil(input.height / stride) + overscan * 2;
  const endRow = Math.min(input.count, startRow + visibleRows);
  return {
    start: startRow,
    end: endRow,
    padTop: startRow * stride,
    totalHeight,
  };
}

export function rowHitIndices(input: { count: number; rect: GridRect; rowOffset?: number }): number[] {
  const offset = input.rowOffset ?? 0;
  if (input.count <= 0 || input.rect.width <= 0 || input.rect.height <= 0) return [];
  const firstRow = Math.max(0, Math.floor((input.rect.y - offset) / ROW_PX));
  const lastRow = Math.min(input.count - 1, Math.floor((input.rect.y + input.rect.height - offset) / ROW_PX));
  const hits: number[] = [];
  for (let row = firstRow; row <= lastRow; row += 1) {
    hits.push(row);
  }
  return hits;
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
