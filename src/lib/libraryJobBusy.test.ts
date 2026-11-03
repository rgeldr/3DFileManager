import { describe, expect, it } from "vitest";
import { LIBRARY_JOB_BUSY_MESSAGE } from "./libraryJobBusy";

describe("libraryJobBusy", () => {
  it("names another window when a shared job is already running", () => {
    expect(LIBRARY_JOB_BUSY_MESSAGE).toMatch(/another window/i);
  });
});
