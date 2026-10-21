import { describe, expect, it } from "vitest";
import {
  centerSubfolders,
  filterTagOptions,
  gridEmptyMessage,
  libraryListScope,
  libraryRefreshKey,
  moveTagHighlight,
  nextSort,
  tagFilterBadge,
  tagFilterKeyAction,
  toggleTagId,
} from "./tagFilter";
import type { FolderRow } from "../types";
import type { TagCount } from "../types";

const tags: TagCount[] = [
  { id: 2, name: "Beta", fileCount: 4 },
  { id: 1, name: "alpha", fileCount: 1 },
  { id: 3, name: "Terrain", fileCount: 0 },
];

describe("filterTagOptions", () => {
  it("sorts tags A-Z and keeps every tag when the query is blank", () => {
    expect(filterTagOptions(tags, "  ").map((tag) => tag.name)).toEqual(["alpha", "Beta", "Terrain"]);
  });

  it("filters the list by a case-insensitive substring", () => {
    expect(filterTagOptions(tags, "ER").map((tag) => tag.id)).toEqual([3]);
    expect(filterTagOptions(tags, "alp").map((tag) => tag.name)).toEqual(["alpha"]);
  });
});

describe("toggleTagId", () => {
  it("adds a tag and removes it on the next toggle", () => {
    expect(toggleTagId([2], 1)).toEqual([2, 1]);
    expect(toggleTagId([2, 1], 1)).toEqual([2]);
  });
});

describe("tagFilterBadge", () => {
  it("shows a count only while tags are selected", () => {
    expect(tagFilterBadge(0)).toBe("Tags");
    expect(tagFilterBadge(3)).toBe("Tags (3)");
  });
});

describe("libraryListScope", () => {
  const folder = { type: "folder" as const, id: 9 };

  it("searches the whole library for a tag filter and leaves a blank creator blank", () => {
    expect(libraryListScope({ browse: folder, query: "", creator: "", selectedTagCount: 1, selectedTypeCount: 0, scope: "library" })).toEqual({
      folder: "all",
      folderId: null,
      creator: "",
    });
    expect(libraryListScope({ browse: folder, query: "orc", creator: "Artisan Guild", selectedTagCount: 2, selectedTypeCount: 1, scope: "library" })).toEqual({
      folder: "all",
      folderId: null,
      creator: "Artisan Guild",
    });
    expect(libraryListScope({ browse: folder, query: "", creator: "", selectedTagCount: 0, selectedTypeCount: 1, scope: "library" })).toEqual({
      folder: "all",
      folderId: null,
      creator: "",
    });
  });

  it("keeps an unfiltered browse inside the current folder", () => {
    expect(libraryListScope({ browse: folder, query: "", creator: "", selectedTagCount: 0, selectedTypeCount: 0, scope: "library" })).toEqual({
      folder: "id",
      folderId: 9,
      creator: "",
    });
    expect(libraryListScope({ browse: { type: "root" }, query: "   ", creator: "", selectedTagCount: 0, selectedTypeCount: 0, scope: "library" }).folder).toBe("root");
  });

  it("limits filtered search to the folder subtree when scope is folder", () => {
    const folder = { type: "folder" as const, id: 9 };
    expect(libraryListScope({ browse: folder, query: "orc", creator: "", selectedTagCount: 0, selectedTypeCount: 0, scope: "folder" })).toEqual({
      folder: "subtree",
      folderId: 9,
      creator: "",
    });
    expect(libraryListScope({ browse: { type: "root" }, query: "orc", creator: "", selectedTagCount: 0, selectedTypeCount: 0, scope: "folder" }).folder).toBe("all");
  });
});

describe("centerSubfolders", () => {
  const folders: FolderRow[] = [
    { id: 1, parentId: null, name: "Beta", relpath: "Beta", sortOrder: 0 },
    { id: 2, parentId: null, name: "alpha", relpath: "alpha", sortOrder: 1 },
    { id: 3, parentId: 1, name: "Nested", relpath: "Beta/Nested", sortOrder: 0 },
  ];

  it("lists direct children at the library root in name order", () => {
    expect(centerSubfolders({ folders, browse: { type: "root" }, query: "", creator: "", selectedTagCount: 0, selectedTypeCount: 0 }).map((f) => f.name)).toEqual(["alpha", "Beta"]);
  });

  it("hides subfolders while any filter is active", () => {
    expect(centerSubfolders({ folders, browse: { type: "root" }, query: "x", creator: "", selectedTagCount: 0, selectedTypeCount: 0 })).toEqual([]);
    expect(centerSubfolders({ folders, browse: { type: "folder", id: 1 }, query: "x", creator: "", selectedTagCount: 0, selectedTypeCount: 0 })).toEqual([]);
  });
});

describe("nextSort", () => {
  it("flips direction on the active field and resets on a new field", () => {
    expect(nextSort({ field: "name", direction: "asc" }, "name")).toEqual({ field: "name", direction: "desc" });
    expect(nextSort({ field: "name", direction: "asc" }, "size")).toEqual({ field: "size", direction: "desc" });
  });
});

describe("libraryRefreshKey", () => {
  const base = {
    browse: { type: "folder" as const, id: 4 },
    query: "",
    creator: "",
    selectedTagIds: [2, 1],
    selectedTypeIds: ["jpg", "stl"],
    tagMatch: "any",
    sort: { field: "name" as const, direction: "asc" as const },
    scope: "library" as const,
  };

  it("stays the same until a list input changes", () => {
    expect(libraryRefreshKey(base)).toBe(libraryRefreshKey({ ...base, selectedTagIds: [1, 2], selectedTypeIds: ["stl", "jpg"] }));
    expect(libraryRefreshKey(base)).not.toBe(libraryRefreshKey({ ...base, browse: { type: "folder", id: 5 } }));
    expect(libraryRefreshKey(base)).not.toBe(libraryRefreshKey({ ...base, query: "lion" }));
    expect(libraryRefreshKey(base)).not.toBe(libraryRefreshKey({ ...base, scope: "folder" }));
  });
});

describe("gridEmptyMessage", () => {
  it("explains an empty tag filter instead of calling the folder empty", () => {
    expect(gridEmptyMessage({ selectedTagCount: 1, selectedTypeCount: 0, creator: "", query: "" })).toBe("No files match the selected tags");
    expect(gridEmptyMessage({ selectedTagCount: 0, selectedTypeCount: 1, creator: "", query: "" })).toBe("No files match the selected types");
    expect(gridEmptyMessage({ selectedTagCount: 1, selectedTypeCount: 1, creator: "", query: "" })).toBe("No files match the current filters");
    expect(gridEmptyMessage({ selectedTagCount: 0, selectedTypeCount: 0, creator: "Artisan Guild", query: "" })).toBe("No files match the current filters");
    expect(gridEmptyMessage({ selectedTagCount: 0, selectedTypeCount: 0, creator: "", query: "" })).toBe("This folder is empty. Drop files here to import them.");
  });
});

describe("tag filter keyboard", () => {
  it("moves the highlight and clamps at the ends", () => {
    expect(moveTagHighlight(0, 3, "up")).toBe(0);
    expect(moveTagHighlight(0, 3, "down")).toBe(1);
    expect(moveTagHighlight(2, 3, "down")).toBe(2);
    expect(moveTagHighlight(4, 0, "down")).toBe(0);
  });

  it("closes on escape, moves on arrows, and toggles with space outside the search box", () => {
    const row = { inSearch: false, highlight: 1, length: 3 };
    expect(tagFilterKeyAction({ ...row, key: "Escape" })).toBe("close");
    expect(tagFilterKeyAction({ ...row, key: "ArrowDown" })).toBe("down");
    expect(tagFilterKeyAction({ ...row, key: "ArrowUp" })).toBe("up");
    expect(tagFilterKeyAction({ ...row, key: " " })).toBe("toggle");
    expect(tagFilterKeyAction({ ...row, key: " ", inSearch: true })).toBe("type");
    expect(tagFilterKeyAction({ ...row, key: " ", length: 0 })).toBe("type");
    expect(tagFilterKeyAction({ ...row, key: "a" })).toBe("type");
  });
});
