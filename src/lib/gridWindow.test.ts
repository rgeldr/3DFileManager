import { describe, expect, it } from "vitest";
import {
  TILE_PX,
  clientToContent,
  columnCount,
  columnWidth,
  contentToClient,
  contentWidth,
  marqueeHitIndices,
  mergeSelection,
  normalizeRect,
  rowStride,
  visibleGridWindow,
} from "./gridWindow";

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

describe("marqueeHitIndices", () => {
  const width = contentWidth(1000);
  const tile = TILE_PX.large;

  it("hits tiles from layout math, including rows that are not mounted", () => {
    expect(columnWidth(width, tile)).toBeCloseTo(904 / 7);
    const first = marqueeHitIndices({
      count: 100,
      width,
      tile,
      rect: { x: 0, y: 0, width: 10, height: 10 },
    });
    expect(first).toEqual([0]);

    const unmounted = marqueeHitIndices({
      count: 100,
      width,
      tile,
      rect: { x: 0, y: rowStride(tile) * 5, width: 20, height: 20 },
    });
    expect(unmounted).toEqual([35]);

    const colW = columnWidth(width, tile);
    const two = marqueeHitIndices({
      count: 100,
      width,
      tile,
      rect: { x: 0, y: 0, width: colW + 12 + 10, height: 20 },
    });
    expect(two).toEqual([0, 1]);
  });

  it("ignores the gap and a zero-size click", () => {
    const colW = columnWidth(width, tile);
    expect(
      marqueeHitIndices({
        count: 100,
        width,
        tile,
        rect: { x: colW + 1, y: 0, width: 4, height: 20 },
      }),
    ).toEqual([]);
    expect(
      marqueeHitIndices({
        count: 100,
        width,
        tile,
        rect: normalizeRect(40, 40, 40, 80),
      }),
    ).toEqual([]);
  });

  it("maps client points through scroll and padding", () => {
    expect(clientToContent(100, 10, 50, 12)).toBe(128);
    expect(contentToClient(128, 10, 50, 12)).toBe(100);
    expect(normalizeRect(30, 80, 10, 20)).toEqual({ x: 10, y: 20, width: 20, height: 60 });
  });

  it("unions hits when the drag adds to the current selection", () => {
    expect(mergeSelection([1, 2], [2, 3], true)).toEqual([1, 2, 3]);
    expect(mergeSelection([1, 2], [3], false)).toEqual([3]);
  });
});
