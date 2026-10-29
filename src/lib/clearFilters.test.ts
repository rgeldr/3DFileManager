import { describe, expect, it } from "vitest";
import { filtersActive } from "./clearFilters";

describe("filtersActive", () => {
  const empty = { query: "", creator: "", selectedTypeIds: [] as string[], selectedTagIds: [] as number[] };

  it("is quiet until a query, creator, type, or tag is set", () => {
    expect(filtersActive(empty)).toBe(false);
    expect(filtersActive({ ...empty, query: "wolf" })).toBe(true);
    expect(filtersActive({ ...empty, creator: "Ada" })).toBe(true);
    expect(filtersActive({ ...empty, selectedTypeIds: ["stl"] })).toBe(true);
    expect(filtersActive({ ...empty, selectedTagIds: [4] })).toBe(true);
  });
});
