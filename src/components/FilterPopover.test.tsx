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
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      if (!this.classList.contains("tag-filter-popover")) return 0;
      const max = this.style.maxHeight;
      if (max && max !== "none") return Math.round(Number.parseFloat(max) + 48);
      return 320;
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

    fireEvent.change(screen.getByPlaceholderText("Filter tags"), { target: { value: "An" } });
    fireEvent.change(screen.getByPlaceholderText("Filter tags"), { target: { value: "Ang" } });
    expect(screen.getByRole("dialog", { name: "Filter by tags" }).style.maxHeight).toBe("320px");

    fireEvent.scroll(screen.getByRole("listbox"));
    expect(screen.getByRole("dialog", { name: "Filter by tags" })).toBeTruthy();
    fireEvent.scroll(document);
    fireEvent.scroll(document.documentElement);
    expect(screen.getByRole("dialog", { name: "Filter by tags" })).toBeTruthy();
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
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(200);
    vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(() => undefined);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });

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

  it("opens and closes both popovers without exceeding the update depth", () => {
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    });
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      if (!this.classList.contains("tag-filter-popover")) return 0;
      const max = this.style.maxHeight;
      if (max && max !== "none") return Math.round(Number.parseFloat(max) + 48);
      return 280;
    });
    vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(() => undefined);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });

    render(
      <>
        <TagFilter
          tags={[{ id: 1, name: "Angels", fileCount: 4 }]}
          selectedIds={[]}
          match="any"
          onSelectedIds={() => undefined}
          onMatch={() => undefined}
        />
        <TypeFilter types={mergeTypeCounts([])} selectedIds={[]} onSelectedIds={() => undefined} />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Tags" }));
    expect(screen.getByRole("dialog", { name: "Filter by tags" })).toBeTruthy();
    const outside = document.createElement("div");
    outside.className = "grid-wrap";
    document.body.append(outside);
    fireEvent.scroll(outside);
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Types" }));
    expect(screen.getByRole("dialog", { name: "Filter by type" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Types" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(errors.join("\n")).not.toMatch(/Maximum update depth|Minified React error #185/);
    outside.remove();
  });
});
