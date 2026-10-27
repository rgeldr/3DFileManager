import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_THEME, isThemeName } from "./themes";
import { readStoredTheme } from "./ThemeProvider";

describe("isThemeName", () => {
  it("accepts known themes", () => {
    expect(isThemeName("dark")).toBe(true);
    expect(isThemeName("light")).toBe(true);
  });

  it("rejects unknown values", () => {
    expect(isThemeName("blue")).toBe(false);
    expect(isThemeName("")).toBe(false);
    expect(isThemeName(null)).toBe(false);
  });
});

describe("readStoredTheme", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("returns a saved valid theme", () => {
    localStorage.setItem("3dfl-theme", "light");
    expect(readStoredTheme()).toBe("light");
  });

  it("falls back when storage has an invalid theme", () => {
    localStorage.setItem("3dfl-theme", "neon");
    expect(readStoredTheme()).toBe(DEFAULT_THEME);
  });

  it("falls back when localStorage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readStoredTheme()).toBe(DEFAULT_THEME);
  });
});
