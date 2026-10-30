import { describe, expect, it } from "vitest";
import {
  contextMenuDownloadSelection,
  downloadSelectMode,
  selectDownloadPath,
} from "./downloadsSelection";

describe("downloadsSelection", () => {
  const ordered = ["/a.stl", "/b.stl", "/c.stl"];

  it("replaces, toggles, and range-selects by path order", () => {
    expect(selectDownloadPath(ordered, [], "/b.stl", "replace")).toEqual(["/b.stl"]);
    expect(selectDownloadPath(ordered, ["/a.stl"], "/c.stl", "toggle")).toEqual(["/a.stl", "/c.stl"]);
    expect(selectDownloadPath(ordered, ["/a.stl"], "/c.stl", "range")).toEqual(["/a.stl", "/b.stl", "/c.stl"]);
  });

  it("maps modifier keys to selection modes", () => {
    expect(downloadSelectMode({ metaKey: false, ctrlKey: false, shiftKey: false })).toBe("replace");
    expect(downloadSelectMode({ metaKey: true, ctrlKey: false, shiftKey: false })).toBe("toggle");
    expect(downloadSelectMode({ metaKey: false, ctrlKey: false, shiftKey: true })).toBe("range");
  });

  it("keeps context-menu selection when the row is already selected", () => {
    expect(contextMenuDownloadSelection(["/a.stl", "/b.stl"], "/b.stl")).toEqual(["/a.stl", "/b.stl"]);
    expect(contextMenuDownloadSelection(["/a.stl"], "/c.stl")).toEqual(["/c.stl"]);
  });
});
