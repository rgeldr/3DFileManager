import { describe, expect, it } from "vitest";
import { visibleGridWindow } from "./gridWindow";

describe("visibleGridWindow", () => {
  it("returns an empty window when there are no files", () => {
    const window = visibleGridWindow({ count: 0, width: 400, height: 300, scrollTop: 0, tile: 96 });
    expect(window).toEqual({ start: 0, end: 0, padTop: 0, totalHeight: 0, columns: expect.any(Number) });
    expect(window.columns).toBeGreaterThan(0);
  });
  it("shows a first page before the pane is measured", () => {
    const window = visibleGridWindow({ count: 100, width: 0, height: 0, scrollTop: 0, tile: 128 });
    expect(window.start).toBe(0);
    expect(window.end).toBe(8);
    expect(window.padTop).toBe(0);
  });

  it("windows a scrolled grid and keeps the full height", () => {
    const window = visibleGridWindow({
      count: 40,
      width: 500,
      height: 300,
      scrollTop: 400,
      tile: 128,
      overscanRows: 1,
    });
    expect(window.columns).toBeGreaterThan(1);
    expect(window.start).toBeGreaterThan(0);
    expect(window.end).toBeGreaterThan(window.start);
    expect(window.end).toBeLessThanOrEqual(40);
    expect(window.totalHeight).toBeGreaterThan(300);
    expect(window.padTop).toBeGreaterThan(0);
  });
});
