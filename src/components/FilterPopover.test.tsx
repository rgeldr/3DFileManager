import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TagFilter } from "./TagFilter";
import { TypeFilter } from "./TypeFilter";
import { mergeTypeCounts } from "../lib/typeFilter";

const filterCss = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../styles/tag-filter.css"),
  "utf8",
);

function rect(values: Partial<DOMRect>): DOMRect {
  return {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    toJSON() {
      return {};
    },
    ...values,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("filter popovers", () => {
  it("pins a right-edge popover inside the viewport and focuses without scrolling", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("tag-filter-anchor")) {
        return rect({ top: 40, right: 1280, bottom: 68, left: 1200, width: 80, height: 28 });
      }
      return rect({});
    });
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("tag-filter-popover") ? 320 : 0;
    });
    const focus = vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(() => undefined);

    render(
      <TagFilter tags={[{ id: 1, name: "Angels", fileCount: 4 }]} selectedIds={[]} match="any" onSelectedIds={() => undefined} onMatch={() => undefined} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Tags" }));
    const dialog = screen.getByRole("dialog", { name: "Filter by tags" });
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog.style.position).not.toBe("absolute");
    expect(filterCss).toMatch(/\.tag-filter-popover\s*\{[^}]*position:\s*fixed/s);
    expect(dialog.style.left).toBe("1032px");
    expect(dialog.style.top).toBe("72px");
    expect(dialog.style.maxHeight).toBe("320px");
    expect(Number.parseFloat(dialog.style.left) + Number.parseFloat(dialog.style.width)).toBe(1272);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });

    fireEvent.scroll(screen.getByRole("listbox"));
    expect(screen.getByRole("dialog", { name: "Filter by tags" })).toBeTruthy();
    fireEvent.scroll(document);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes the Types popover on an outside press and repositions on resize", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("tag-filter-anchor")) {
        return rect({ top: 40, right: 1280, bottom: 68, left: 1200, width: 80, height: 28 });
      }
      return rect({});
    });
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(200);
    vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(() => undefined);

    render(<TypeFilter types={mergeTypeCounts([])} selectedIds={[]} onSelectedIds={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Types" }));
    const dialog = screen.getByRole("dialog", { name: "Filter by type" });
    expect(dialog.parentElement).toBe(document.body);

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 900 });
    fireEvent(window, new Event("resize"));
    expect(screen.getByRole("dialog").style.left).toBe("652px");

    fireEvent.pointerDown(document.documentElement);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
