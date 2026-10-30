import { describe, expect, it } from "vitest";
import { compareDownloads, orderedDownloadPaths, sortedDownloadRows } from "./downloadsSort";
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

  it("compares path, size, and modified time, and breaks equal sizes by name", () => {
    const root = rows[1];
    const boats = rows[0];
    expect(compareDownloads(root, boats, { field: "path", direction: "asc" })).toBeLessThan(0);
    expect(compareDownloads(root, boats, { field: "size", direction: "asc" })).toBeGreaterThan(0);
    expect(compareDownloads(rows[2], root, { field: "modified", direction: "desc" })).toBeLessThan(0);
    const laterName = { ...boats, name: "z.stl" };
    expect(compareDownloads(laterName, boats, { field: "size", direction: "desc" })).toBeGreaterThan(0);
    const byName = sortedDownloadRows(rows, { field: "name", direction: "asc" });
    expect(byName.map((row) => row.name)).toEqual(["a.stl", "b.stl", "c.stl"]);
    const sameName = [
      { ...boats, name: "a.stl", relativeDir: "z" },
      { ...root, name: "a.stl", relativeDir: "" },
    ];
    expect(sortedDownloadRows(sameName, { field: "name", direction: "asc" }).map((row) => row.relativeDir)).toEqual(["", "z"]);
    expect(compareDownloads(
      { ...boats, mtime: 5, name: "m.stl" },
      { ...root, mtime: 5, name: "a.stl" },
      { field: "modified", direction: "asc" },
    )).toBeGreaterThan(0);
  });

  it("orders paths for shift-click range selection", () => {
    expect(orderedDownloadPaths(rows, { field: "path", direction: "asc" })).toEqual([
      "/d/a.stl",
      "/d/boats/b.stl",
      "/d/boats/c.stl",
    ]);
  });
});
