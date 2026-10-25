/** Pixel widths for the Details view. The name column grows past its saved width. */
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

export function resetDetailsColumn(columns: DetailsColumns, id: DetailsColumnId): DetailsColumns {
  return { ...columns, [id]: DETAILS_COLUMN_LIMITS[id].default };
}

/** Name fills leftover space. The other columns stay at their saved pixel widths. */
export function detailsColumnTemplate(columns: DetailsColumns): string {
  const next = clampDetailsColumns(columns);
  return `minmax(${next.name}px, 1fr) ${next.size}px ${next.modified}px ${next.added}px ${next.creator}px`;
}
