import { describe, expect, it } from "vitest";
import {
  SUPPORTED_TYPE_GROUPS,
  extsForSelectedTypes,
  filterTypeOptions,
  mergeTypeCounts,
  toggleTypeId,
  typeFilterBadge,
  typeFilterShowsSearch,
} from "./typeFilter";
import type { TypeCount } from "../types";

const types: TypeCount[] = [
  { id: "pdf", label: "pdf", exts: ["pdf"], fileCount: 2 },
  { id: "jpg", label: "jpg / jpeg", exts: ["jpg", "jpeg"], fileCount: 5 },
  { id: "stl", label: "stl", exts: ["stl"], fileCount: 1 },
];

describe("supported import types", () => {
  it("lists each import type once and groups jpg with jpeg", () => {
    const ids = SUPPORTED_TYPE_GROUPS.map((group) => group.id);
    expect(new Set(ids).size).toBe(ids.length);
    const exts = SUPPORTED_TYPE_GROUPS.flatMap((group) => group.exts);
    expect(new Set(exts).size).toBe(exts.length);
    const jpg = SUPPORTED_TYPE_GROUPS.find((group) => group.id === "jpg");
    expect(jpg?.exts).toEqual(["jpg", "jpeg"]);
    expect(exts.filter((ext) => ext === "jpg" || ext === "jpeg")).toEqual(["jpg", "jpeg"]);
    expect(exts).not.toContain("lychee");
    expect(exts).not.toContain("zip");
    expect(SUPPORTED_TYPE_GROUPS.map((group) => group.id)).toEqual([
      "stl", "obj", "3mf", "lys", "png", "jpg", "pdf", "txt", "step", "gcode", "bgcode", "ctb", "chitubox", "ags", "f3d", "md", "scad",
    ]);
    expect(mergeTypeCounts([{ id: "jpg", label: "ignored", exts: ["jpg"], fileCount: 4 }]).find((type) => type.id === "jpg")).toMatchObject({
      label: "jpg / jpeg",
      exts: ["jpg", "jpeg"],
      fileCount: 4,
    });
    expect(mergeTypeCounts([]).map((type) => type.id)).toEqual(ids);
  });
});

describe("type filter popover", () => {
  it("filters by label or extension and toggles a type", () => {
    expect(filterTypeOptions(types, "  ").map((type) => type.id)).toEqual(["jpg", "pdf", "stl"]);
    expect(filterTypeOptions(types, "JPEG").map((type) => type.id)).toEqual(["jpg"]);
    expect(toggleTypeId(["stl"], "jpg")).toEqual(["stl", "jpg"]);
    expect(toggleTypeId(["stl", "jpg"], "jpg")).toEqual(["stl"]);
    expect(extsForSelectedTypes(["jpg", "step"])).toEqual(["jpg", "jpeg", "step", "stp"]);
  });

  it("labels the button with the selection count and searches only a long list", () => {
    expect(typeFilterBadge(0)).toBe("File Types");
    expect(typeFilterBadge(2)).toBe("File Types (2)");
    expect(typeFilterShowsSearch(8)).toBe(false);
    expect(typeFilterShowsSearch(SUPPORTED_TYPE_GROUPS.length)).toBe(true);
  });
});
