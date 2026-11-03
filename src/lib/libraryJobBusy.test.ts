import { describe, expect, it } from "vitest";
import { LIBRARY_JOB_BUSY_MESSAGE } from "./libraryJobBusy";

describe("libraryJobBusy", () => {
  it("names a rescan already running in another window", () => {
    expect(LIBRARY_JOB_BUSY_MESSAGE).toBe(
      "A rescan is already running in another window.",
    );
  });
});
