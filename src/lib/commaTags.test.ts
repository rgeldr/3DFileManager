import { describe, expect, it } from "vitest";
import { commaTagOptions } from "./commaTags";

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
