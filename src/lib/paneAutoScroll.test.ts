import { describe, expect, it, vi } from "vitest";
import { scrollPaneAtPointer, scrollPanesUnderPointer } from "./paneAutoScroll";

describe("paneAutoScroll", () => {
  it("scrolls toward the nearest edge inside the pane", () => {
    const pane = document.createElement("div");
    pane.scrollTop = 100;
    vi.spyOn(pane, "getBoundingClientRect").mockReturnValue({
      top: 0,
      bottom: 200,
      left: 0,
      right: 100,
      width: 100,
      height: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    scrollPaneAtPointer(50, 5, pane);
    expect(pane.scrollTop).toBeLessThan(100);
    const beforeBottom = pane.scrollTop;
    scrollPaneAtPointer(50, 195, pane);
    expect(pane.scrollTop).toBeGreaterThan(beforeBottom);
  });

  it("scrolls the pane under the pointer", () => {
    const pane = document.createElement("div");
    pane.scrollTop = 0;
    vi.spyOn(pane, "getBoundingClientRect").mockReturnValue({
      top: 10,
      bottom: 210,
      left: 0,
      right: 100,
      width: 100,
      height: 200,
      x: 0,
      y: 10,
      toJSON: () => ({}),
    });
    scrollPanesUnderPointer(20, 15, [pane]);
    expect(pane.scrollTop).toBeLessThan(0);
  });
});
