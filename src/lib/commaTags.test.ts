import { describe, expect, it } from "vitest";
import { appendCommaTags, commaTagOptions, tagFieldKey } from "./commaTags";

const tags = ["FDM", "skeleton", "resin"];

describe("commaTagOptions", () => {
  it("leaves a single tag for the browser to match", () => {
    expect(commaTagOptions("FDM", tags)).toEqual(tags);
    expect(commaTagOptions("", tags)).toEqual(tags);
  });

  it("suggests tags that match the segment after the last comma", () => {
    expect(commaTagOptions("FDM, ske", tags)).toEqual(["FDM, skeleton"]);
    expect(commaTagOptions("FDM, SKE", tags)).toEqual(["FDM, skeleton"]);
    expect(commaTagOptions("Terrain, FDM, re", tags)).toEqual(["Terrain, FDM, resin"]);
  });

  it("keeps the earlier tags and the space before the segment being typed", () => {
    expect(commaTagOptions("FDM,  ske", tags)).toEqual(["FDM,  skeleton"]);
  });

  it("lists every tag when the segment after the comma is empty", () => {
    expect(commaTagOptions("FDM, ", tags)).toEqual(["FDM, FDM", "FDM, skeleton", "FDM, resin"]);
  });
});

describe("appendCommaTags", () => {
  it("splits, trims, and drops empties", () => {
    expect(appendCommaTags([], " FDM, skeleton, ,resin ")).toEqual(["FDM", "skeleton", "resin"]);
  });

  it("drops duplicates against existing chips, ignoring case", () => {
    expect(appendCommaTags(["FDM"], "fdm, skeleton, FDM, Skeleton")).toEqual(["FDM", "skeleton"]);
  });

  it("keeps the chips when the field is blank", () => {
    expect(appendCommaTags(["FDM"], "  ,  ")).toEqual(["FDM"]);
  });
});

describe("tagFieldKey", () => {
  it("leaves a comma in the field so the next tag can be suggested", () => {
    expect(tagFieldKey([], "FDM", ",")).toBeNull();
    expect(tagFieldKey([], "FDM, skeleton", ",")).toBeNull();
  });

  it("commits the list on Enter", () => {
    expect(tagFieldKey(["resin"], "fdm, skeleton", "Enter")).toEqual({
      tags: ["resin", "fdm", "skeleton"],
      text: "",
    });
  });
});
