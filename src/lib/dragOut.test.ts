import { describe, expect, it, vi } from "vitest";
import {
  dragSourceKey,
  dragSources,
  fileDragOptions,
  isPreviewDragValue,
  nativeDragDecision,
  pointerOutsideWindow,
  pointerPastSlop,
  shouldBlockHtmlDrag,
  suppressHtmlDrag,
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

  it("starts the file drag when a thumbnail drag would have begun, even inside the window", () => {
    expect(nativeDragDecision({ ...ready, outside: false, imageDrag: true })).toBe("start");
    expect(nativeDragDecision({ ...ready, outside: false, pastSlop: false, imageDrag: true })).toBe("start");
    expect(nativeDragDecision({ ...ready, outside: false, imageDrag: true, pathsReady: false })).toBe("wait-for-paths");
  });

  it("cancels an image or canvas drag and does not put the thumbnail URL on it", () => {
    const tile = document.createElement("button");
    tile.className = "tile";
    tile.dataset.fileId = "4";
    const image = document.createElement("img");
    image.src = "asset://localhost/thumbs/abc.png";
    tile.appendChild(image);
    const canvas = document.createElement("canvas");
    const viewer = document.createElement("div");
    viewer.className = "viewer";
    viewer.appendChild(canvas);
    expect(shouldBlockHtmlDrag(image)).toBe(true);
    expect(shouldBlockHtmlDrag(canvas)).toBe(true);
    expect(shouldBlockHtmlDrag(viewer)).toBe(true);
    expect(shouldBlockHtmlDrag(document.createElement("div"))).toBe(false);
    const setData = vi.fn();
    const clearData = vi.fn();
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    expect(suppressHtmlDrag({
      target: image,
      preventDefault,
      stopPropagation,
      dataTransfer: { clearData, setData },
    })).toBe(true);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(clearData).toHaveBeenCalledOnce();
    expect(setData).not.toHaveBeenCalled();
    expect(isPreviewDragValue(image.src)).toBe(true);
    expect(isPreviewDragValue("C:\\Library\\Hero.stl")).toBe(false);
    expect(fileDragOptions(
      ["C:\\Library\\Hero.stl", "C:\\Library\\Base.stl"],
      "C:\\app\\icons\\drag.png",
    )).toEqual({
      item: ["C:\\Library\\Hero.stl", "C:\\Library\\Base.stl"],
      icon: "C:\\app\\icons\\drag.png",
    });
    expect(() => fileDragOptions(["asset://localhost/thumbs/abc.png"], "C:\\app\\icons\\drag.png")).toThrow(/library file/);
    expect(() => fileDragOptions(["C:\\Library\\Hero.stl"], "C:\\thumbs\\abc.png")).toThrow(/drag icon/);
    const sources = dragSources(
      [
        { id: 2 },
        { id: 4 },
      ],
      [4, 9, 2],
    );
    expect(sources).toEqual([4, 2]);
    expect(dragSourceKey(sources)).toBe("4\n2");
  });
});
