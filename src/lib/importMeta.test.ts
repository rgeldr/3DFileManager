import { describe, expect, it } from "vitest";
import { importMetaPayload } from "./importMeta";

describe("importMetaPayload", () => {
  it("returns null when creator and tags are blank", () => {
    expect(importMetaPayload([1, 2], "  ", ["", "  "])).toBeNull();
  });

  it("keeps only the imported ids the caller passes", () => {
    expect(importMetaPayload([4], "Ada", [])).toEqual({
      ids: [4],
      creator: "Ada",
      tags: null,
    });
    expect(importMetaPayload([4, 5], "", ["Terrain", " FDM "])).toEqual({
      ids: [4, 5],
      creator: null,
      tags: ["Terrain", "FDM"],
    });
  });
});
