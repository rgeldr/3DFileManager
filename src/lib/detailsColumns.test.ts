import { describe, expect, it } from "vitest";
import {
  DEFAULT_DETAILS_COLUMNS,
  DETAILS_COLUMN_LIMITS,
  clampDetailsColumn,
  clampDetailsColumns,
  columnResizeWidth,
  detailsColumnRightEdge,
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

  it("builds fixed tracks and leaves leftover space after the last column", () => {
    expect(detailsColumnTemplate(DEFAULT_DETAILS_COLUMNS)).toBe("240px 96px 176px 176px 128px minmax(0px, 1fr)");
    expect(detailsColumnTemplate({ ...DEFAULT_DETAILS_COLUMNS, name: 10, added: 9999 })).toBe(
      `${DETAILS_COLUMN_LIMITS.name.min}px 96px 176px ${DETAILS_COLUMN_LIMITS.added.max}px 128px minmax(0px, 1fr)`,
    );
  });

  it("moves the dragged column's right edge in the same direction as the pointer", () => {
    const start = DEFAULT_DETAILS_COLUMNS;
    const widerSize = resizeDetailsColumn(start, "size", 40);
    expect(detailsColumnRightEdge(widerSize, "size") - detailsColumnRightEdge(start, "size")).toBe(40);
    expect(detailsColumnRightEdge(widerSize, "name")).toBe(detailsColumnRightEdge(start, "name"));

    const narrowerCreator = resizeDetailsColumn(start, "creator", -20);
    expect(detailsColumnRightEdge(narrowerCreator, "creator") - detailsColumnRightEdge(start, "creator")).toBe(-20);
    expect(detailsColumnRightEdge(narrowerCreator, "added")).toBe(detailsColumnRightEdge(start, "added"));

    const widerName = resizeDetailsColumn(start, "name", 30);
    expect(detailsColumnRightEdge(widerName, "name") - detailsColumnRightEdge(start, "name")).toBe(30);
    expect(detailsColumnRightEdge(widerName, "size") - detailsColumnRightEdge(start, "size")).toBe(30);
  });

  it("starts a border drag from the rendered width and still clamps", () => {
    expect(columnResizeWidth("name", 480, 240, 20)).toBe(500);
    expect(columnResizeWidth("name", 480, 240, -1000)).toBe(DETAILS_COLUMN_LIMITS.name.min);
    expect(columnResizeWidth("size", 96, 96, -40)).toBe(DETAILS_COLUMN_LIMITS.size.min);
    expect(columnResizeWidth("size", 0, 96, -40)).toBe(DETAILS_COLUMN_LIMITS.size.min);
    expect(columnResizeWidth("modified", 176, 176, 500)).toBe(DETAILS_COLUMN_LIMITS.modified.max);
  });
});
