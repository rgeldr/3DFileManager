import { describe, expect, it } from "vitest";
import { sortedDownloadRows, orderedDownloadPaths } from "./downloadsSort";
import type { DownloadRow } from "../types";

describe("downloadsSort", () => {
  const rows: DownloadRow[] = [
    { name: "b.stl", relativeDir: "boats", ext: "stl", sizeBytes: 1, mtime: 1, absolutePath: "/d/boats/b.stl" },
    { name: "a.stl", relativeDir: "", ext: "stl", sizeBytes: 2, mtime: 2, absolutePath: "/d/a.stl" },
    { name: "c.stl", relativeDir: "boats", ext: "stl", sizeBytes: 3, mtime: 3, absolutePath: "/d/boats/c.stl" },
  ];

  it("defaults to path then name", () => {
    const sorted = sortedDownloadRows(rows, { field: "path", direction: "asc" });
    expect(sorted.map((row) => row.absolutePath)).toEqual(["/d/a.stl", "/d/boats/b.stl", "/d/boats/c.stl"]);
  });

  it("orders paths for shift-click range selection", () => {
    expect(orderedDownloadPaths(rows, { field: "path", direction: "asc" })).toEqual([
      "/d/a.stl",
      "/d/boats/b.stl",
      "/d/boats/c.stl",
    ]);
  });
});
