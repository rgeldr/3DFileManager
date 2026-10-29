import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_THEME, isThemeName } from "./themes";
import { ThemeProvider, applyTheme, readStoredTheme, useTheme } from "./ThemeProvider";

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

function ThemeProbe() {
  const { theme, setTheme } = useTheme();
  return createElement("button", { type: "button", onClick: () => setTheme("light") }, theme);
}

describe("applyTheme and useTheme", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it("applyTheme sets data-theme and stores the choice", () => {
    applyTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("3dfl-theme")).toBe("light");
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("3dfl-theme")).toBe("dark");
  });

  it("useTheme reads the provider and updates the document", () => {
    render(createElement(ThemeProvider, { initial: "dark", children: createElement(ThemeProbe) }));
    expect(screen.getByRole("button").textContent).toBe("dark");
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button").textContent).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("3dfl-theme")).toBe("light");
  });

  it("useTheme throws outside ThemeProvider", () => {
    expect(() => render(createElement(ThemeProbe))).toThrow("useTheme must be used within ThemeProvider");
  });
});
