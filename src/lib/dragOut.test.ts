import { describe, expect, it } from "vitest";
import {
  dragSourceKey,
  dragSources,
  nativeDragDecision,
  pointerOutsideWindow,
  pointerPastSlop,
  shouldBlockHtmlDrag,
} from "./dragOut";

const ready = {
  buttonDown: true,
  pastSlop: true,
  outside: true,
  started: false,
  pathsReady: true,
};

describe("native drag gesture", () => {
  it("starts only after the pointer leaves the window with paths already resolved", () => {
    expect(nativeDragDecision(ready)).toBe("start");
    expect(nativeDragDecision({ ...ready, outside: false })).toBe("continue");
    expect(nativeDragDecision({ ...ready, pastSlop: false })).toBe("continue");
    expect(nativeDragDecision({ ...ready, buttonDown: false })).toBe("continue");
    expect(nativeDragDecision({ ...ready, started: true })).toBe("continue");
  });

  it("waits for a prefetch that has not returned while the button is still down", () => {
    expect(nativeDragDecision({ ...ready, pathsReady: false })).toBe("wait-for-paths");
    expect(nativeDragDecision({ ...ready, pathsReady: false, buttonDown: false })).toBe("continue");
  });

  it("treats the window edge as outside and ignores a small twitch", () => {
    expect(pointerOutsideWindow(0, 40, 800, 600)).toBe(true);
    expect(pointerOutsideWindow(-4, 40, 800, 600)).toBe(true);
    expect(pointerOutsideWindow(799, 10, 800, 600)).toBe(true);
    expect(pointerOutsideWindow(12, 40, 800, 600)).toBe(false);
    expect(pointerPastSlop(10, 10, 12, 11)).toBe(false);
    expect(pointerPastSlop(10, 10, 20, 10)).toBe(true);
  });

  it("blocks an HTML5 drag that starts on a file tile and keeps selection order", () => {
    const tile = document.createElement("button");
    tile.dataset.fileId = "4";
    const image = document.createElement("img");
    tile.appendChild(image);
    expect(shouldBlockHtmlDrag(image)).toBe(true);
    expect(shouldBlockHtmlDrag(document.createElement("div"))).toBe(false);
    const sources = dragSources(
      [
        { id: 2, absolutePath: "/lib/b.stl", originalName: "B.STL", ext: "stl" },
        { id: 4, absolutePath: "/lib/a.stl", originalName: "A.stl", ext: "stl" },
      ],
      [4, 2],
    );
    expect(sources.map((source) => source.fileName)).toEqual(["A.stl", "B.STL"]);
    expect(dragSourceKey(sources)).toContain("/lib/a.stl");
  });
});
