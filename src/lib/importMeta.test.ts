import { describe, expect, it } from "vitest";
import { importMetaPayload, tagsWithPending } from "./importMeta";

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

  it("keeps a tag that was typed but not confirmed with Enter", () => {
    expect(tagsWithPending(["skeleton"], "  ")).toEqual(["skeleton"]);
    expect(tagsWithPending(["skeleton"], "Skeleton")).toEqual(["skeleton"]);
    expect(tagsWithPending(["skeleton"], "flexi")).toEqual(["skeleton", "flexi"]);
    expect(importMetaPayload([7], "Flexi Factory", tagsWithPending([], "skeleton"))).toEqual({
      ids: [7],
      creator: "Flexi Factory",
      tags: ["skeleton"],
    });
  });
});
