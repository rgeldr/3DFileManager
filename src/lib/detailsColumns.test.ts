import { describe, expect, it } from "vitest";
import {
  DEFAULT_DETAILS_COLUMNS,
  DETAILS_COLUMN_LIMITS,
  clampDetailsColumn,
  clampDetailsColumns,
  detailsColumnTemplate,
  resetDetailsColumn,
  resizeDetailsColumn,
} from "./detailsColumns";

describe("details column widths", () => {
  it("clamps each column to its own minimum and maximum", () => {
    expect(clampDetailsColumn("name", 10)).toBe(DETAILS_COLUMN_LIMITS.name.min);
    expect(clampDetailsColumn("name", 5000)).toBe(DETAILS_COLUMN_LIMITS.name.max);
    expect(clampDetailsColumn("size", 96.4)).toBe(96);
    expect(clampDetailsColumn("creator", Number.NaN)).toBe(DETAILS_COLUMN_LIMITS.creator.default);
    expect(clampDetailsColumn("modified", DETAILS_COLUMN_LIMITS.modified.min)).toBe(96);
    expect(clampDetailsColumn("added", DETAILS_COLUMN_LIMITS.added.max)).toBe(360);
  });

  it("fills missing saved widths with the defaults", () => {
    expect(clampDetailsColumns(null)).toEqual(DEFAULT_DETAILS_COLUMNS);
    expect(clampDetailsColumns({ size: 40, creator: 900 })).toEqual({
      ...DEFAULT_DETAILS_COLUMNS,
      size: DETAILS_COLUMN_LIMITS.size.min,
      creator: DETAILS_COLUMN_LIMITS.creator.max,
    });
  });

  it("resizes from a drag delta and resets one column", () => {
    const wider = resizeDetailsColumn(DEFAULT_DETAILS_COLUMNS, "size", 40);
    expect(wider.size).toBe(136);
    expect(wider.name).toBe(DEFAULT_DETAILS_COLUMNS.name);
    const stuck = resizeDetailsColumn(DEFAULT_DETAILS_COLUMNS, "size", -1000);
    expect(stuck.size).toBe(DETAILS_COLUMN_LIMITS.size.min);
    const reset = resetDetailsColumn({ ...wider, size: 200 }, "size");
    expect(reset.size).toBe(DETAILS_COLUMN_LIMITS.size.default);
    expect(reset.name).toBe(DEFAULT_DETAILS_COLUMNS.name);
  });

  it("builds a grid template that lets the name column grow", () => {
    expect(detailsColumnTemplate(DEFAULT_DETAILS_COLUMNS)).toBe("minmax(240px, 1fr) 96px 176px 176px 128px");
    expect(detailsColumnTemplate({ ...DEFAULT_DETAILS_COLUMNS, name: 10, added: 9999 })).toBe(
      `minmax(${DETAILS_COLUMN_LIMITS.name.min}px, 1fr) 96px 176px ${DETAILS_COLUMN_LIMITS.added.max}px 128px`,
    );
  });
});
