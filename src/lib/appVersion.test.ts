import { describe, expect, it } from "vitest";
import { isNewerAppVersion, parseAppVersion } from "./appVersion";

describe("app version", () => {
  it("parses date versions numerically, including a leading v and zero", () => {
    expect(parseAppVersion("26.10.26")).toEqual([26, 10, 26]);
    expect(parseAppVersion("v26.10.9")).toEqual([26, 10, 9]);
    expect(parseAppVersion("26.09.2")).toEqual([26, 9, 2]);
    expect(parseAppVersion("26.10")).toBeNull();
  });

  it("orders date versions as semver rather than as strings", () => {
    expect("26.10.9" > "26.10.26").toBe(true);
    expect(isNewerAppVersion("26.10.26", "26.10.9")).toBe(true);
    expect(isNewerAppVersion("26.10.9", "26.10.26")).toBe(false);
    expect(isNewerAppVersion("26.10.26", "26.10.25")).toBe(true);
    expect(isNewerAppVersion("26.10.26", "26.10.26")).toBe(false);
    expect(isNewerAppVersion("26.11.1", "26.10.26")).toBe(true);
    expect(isNewerAppVersion("26.10.1", "26.9.30")).toBe(true);
    expect(isNewerAppVersion("26.09.2", "26.08.15")).toBe(true);
    expect(isNewerAppVersion("26.09.1", "26.9.1")).toBe(false);
    expect(isNewerAppVersion("latest", "26.10.26")).toBeNull();
  });
});
