import { describe, expect, it } from "vitest";
import { TILE_PX, columnCount, contentWidth, rowStride, visibleGridWindow } from "./gridWindow";

describe("visibleGridWindow", () => {
  it("returns an empty window when there are no files", () => {
    const window = visibleGridWindow({ count: 0, width: 400, height: 300, scrollTop: 0, tile: 96 });
    expect(window).toEqual({ start: 0, end: 0, padTop: 0, totalHeight: 0, columns: 3 });
  });

  it("shows a first page before the pane is measured", () => {
    const window = visibleGridWindow({ count: 100, width: 0, height: 0, scrollTop: 0, tile: 128 });
    expect(window.start).toBe(0);
    expect(window.end).toBe(8);
    expect(window.padTop).toBe(0);
  });

  it("uses the large-grid stride on a 1000px pane after wrap padding", () => {
    const width = contentWidth(1000);
    const tile = TILE_PX.large;
    expect(width).toBe(976);
    expect(rowStride(tile)).toBe(184);
    expect(columnCount(width, tile)).toBe(7);

    const scrollTop = 184 * 3;
    const window = visibleGridWindow({
      count: 100,
      width,
      height: 400,
      scrollTop,
      tile,
      overscanRows: 1,
    });
    expect(window.columns).toBe(7);
    expect(window.start).toBe(14);
    expect(window.padTop).toBe(368);
    expect(window.end).toBe(49);
  });
});
