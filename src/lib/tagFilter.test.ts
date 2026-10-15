import { describe, expect, it } from "vitest";
import {
  filterTagOptions,
  gridEmptyMessage,
  libraryListScope,
  moveTagHighlight,
  tagFilterBadge,
  tagFilterKeyAction,
  toggleTagId,
} from "./tagFilter";
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
    expect(libraryListScope({ browse: folder, query: "", creator: "", selectedTagCount: 1 })).toEqual({
      folder: "all",
      folderId: null,
      creator: "",
    });
    expect(libraryListScope({ browse: folder, query: "orc", creator: "Artisan Guild", selectedTagCount: 2 })).toEqual({
      folder: "all",
      folderId: null,
      creator: "Artisan Guild",
    });
  });

  it("keeps an unfiltered browse inside the current folder", () => {
    expect(libraryListScope({ browse: folder, query: "", creator: "", selectedTagCount: 0 })).toEqual({
      folder: "id",
      folderId: 9,
      creator: "",
    });
    expect(libraryListScope({ browse: { type: "root" }, query: "   ", creator: "", selectedTagCount: 0 }).folder).toBe("root");
  });
});

describe("gridEmptyMessage", () => {
  it("explains an empty tag filter instead of calling the folder empty", () => {
    expect(gridEmptyMessage({ selectedTagCount: 1, creator: "", query: "" })).toBe("No files match the selected tags");
    expect(gridEmptyMessage({ selectedTagCount: 0, creator: "Artisan Guild", query: "" })).toBe("No files match the current filters");
    expect(gridEmptyMessage({ selectedTagCount: 0, creator: "", query: "" })).toBe("This folder is empty. Drop files here to import them.");
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
