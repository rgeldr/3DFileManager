import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { LibraryModel } from "../../hooks/useLibrary";
import { AboutDialog } from "./AboutDialog";

const stylesDir = join(dirname(fileURLToPath(import.meta.url)), "../../styles");

const libraryStats = vi.fn();

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

vi.mock("../../api", () => ({
  api: {
    libraryStats: (...args: unknown[]) => libraryStats(...args),
  },
}));

beforeAll(() => {
  const style = document.createElement("style");
  style.textContent = `${readFileSync(join(stylesDir, "tokens.css"), "utf8")}\n${readFileSync(join(stylesDir, "dialogs.css"), "utf8")}`;
  document.head.appendChild(style);
});

afterEach(() => {
  cleanup();
  libraryStats.mockReset();
});

function app(aboutOpen: boolean): LibraryModel {
  return {
    aboutOpen,
    setAboutOpen: () => undefined,
    aboutVersion: "26.10.21",
    aboutVersionFailed: false,
    setError: () => undefined,
  } as unknown as LibraryModel;
}

describe("About dialog", () => {
  it("loads catalog counts when the dialog opens", async () => {
    libraryStats.mockResolvedValue({ fileCount: 2, folderCount: 3, sizeBytes: 13_314_398_618 });
    const view = render(<AboutDialog app={app(false)} />);
    expect(libraryStats).not.toHaveBeenCalled();
    expect(screen.queryByText("Files: 2")).toBeNull();

    view.rerender(<AboutDialog app={app(true)} />);
    expect(await screen.findByText("Files: 2")).toBeTruthy();
    expect(screen.getByText("Folders: 3")).toBeTruthy();
    expect(screen.getByText("Size on disk: 12.4 GB")).toBeTruthy();
    expect(libraryStats).toHaveBeenCalledTimes(1);

    const link = screen.getByRole("link", { name: "26.10.21" });
    expect(link.className).toBe("about-version");
    const rule = [...document.styleSheets]
      .flatMap((sheet) => [...sheet.cssRules])
      .find((entry): entry is CSSStyleRule => entry instanceof CSSStyleRule && entry.selectorText.includes("a.about-version:visited"));
    expect(rule?.selectorText).toContain(":link");
    expect(rule?.selectorText).toContain(":hover");
    expect(rule?.selectorText).toContain(":active");
    expect(rule?.style.color).toBe("var(--color-text)");
    expect(rule?.style.textDecorationLine).toBe("underline");
    expect(getComputedStyle(link).color).toBe("var(--color-text)");
    expect(getComputedStyle(link).textDecorationLine).toBe("underline");
    expect(readFileSync(join(stylesDir, "tokens.css"), "utf8")).toContain("--color-text: #dddee0");
  });
});
