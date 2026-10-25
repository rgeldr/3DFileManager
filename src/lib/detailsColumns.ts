/** Pixel widths for the Details view. Leftover space sits after the last column. */
export const DETAILS_COLUMN_IDS = ["name", "size", "modified", "added", "creator"] as const;

export type DetailsColumnId = (typeof DETAILS_COLUMN_IDS)[number];

export interface DetailsColumns {
  name: number;
  size: number;
  modified: number;
  added: number;
  creator: number;
}

export const DETAILS_COLUMN_LIMITS: Record<DetailsColumnId, { default: number; min: number; max: number }> = {
  name: { default: 240, min: 120, max: 800 },
  size: { default: 96, min: 64, max: 280 },
  modified: { default: 176, min: 96, max: 360 },
  added: { default: 176, min: 96, max: 360 },
  creator: { default: 128, min: 72, max: 400 },
};

export const DEFAULT_DETAILS_COLUMNS: DetailsColumns = {
  name: DETAILS_COLUMN_LIMITS.name.default,
  size: DETAILS_COLUMN_LIMITS.size.default,
  modified: DETAILS_COLUMN_LIMITS.modified.default,
  added: DETAILS_COLUMN_LIMITS.added.default,
  creator: DETAILS_COLUMN_LIMITS.creator.default,
};

export function clampDetailsColumn(id: DetailsColumnId, width: number): number {
  const limits = DETAILS_COLUMN_LIMITS[id];
  if (!Number.isFinite(width)) return limits.default;
  return Math.min(limits.max, Math.max(limits.min, Math.round(width)));
}

export function clampDetailsColumns(input: Partial<DetailsColumns> | null | undefined): DetailsColumns {
  return {
    name: clampDetailsColumn("name", input?.name ?? DEFAULT_DETAILS_COLUMNS.name),
    size: clampDetailsColumn("size", input?.size ?? DEFAULT_DETAILS_COLUMNS.size),
    modified: clampDetailsColumn("modified", input?.modified ?? DEFAULT_DETAILS_COLUMNS.modified),
    added: clampDetailsColumn("added", input?.added ?? DEFAULT_DETAILS_COLUMNS.added),
    creator: clampDetailsColumn("creator", input?.creator ?? DEFAULT_DETAILS_COLUMNS.creator),
  };
}

export function resizeDetailsColumn(columns: DetailsColumns, id: DetailsColumnId, deltaX: number): DetailsColumns {
  return { ...columns, [id]: clampDetailsColumn(id, columns[id] + deltaX) };
}

/**
 * Width after dragging the right edge of one header cell.
 * The origin is that cell's on-screen width, so the border follows the pointer
 * when the saved width and the laid-out width differ. A zero reading (hidden
 * header, or jsdom) falls back to the saved width.
 */
export function columnResizeWidth(
  id: DetailsColumnId,
  renderedWidth: number,
  savedWidth: number,
  deltaX: number,
): number {
  const origin = renderedWidth > 0 ? renderedWidth : savedWidth;
  return clampDetailsColumn(id, origin + deltaX);
}

/** Right edge of a column when every column is a fixed track and leftover space is after Creator. */
export function detailsColumnRightEdge(columns: DetailsColumns, id: DetailsColumnId): number {
  const next = clampDetailsColumns(columns);
  let edge = 0;
  for (const columnId of DETAILS_COLUMN_IDS) {
    edge += next[columnId];
    if (columnId === id) break;
  }
  return edge;
}

export function resetDetailsColumn(columns: DetailsColumns, id: DetailsColumnId): DetailsColumns {
  return { ...columns, [id]: DETAILS_COLUMN_LIMITS[id].default };
}

/**
 * Every column is its saved pixel width, left to right.
 * Leftover space is a blank track after Creator. A flexible Name track would pin
 * the other columns to the right edge, so dragging a border would move the edge
 * to its left in the opposite direction.
 */
export function detailsColumnTemplate(columns: DetailsColumns): string {
  const next = clampDetailsColumns(columns);
  return `${next.name}px ${next.size}px ${next.modified}px ${next.added}px ${next.creator}px minmax(0px, 1fr)`;
}
