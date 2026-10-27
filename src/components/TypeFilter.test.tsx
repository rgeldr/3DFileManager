import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SUPPORTED_TYPE_GROUPS, mergeTypeCounts } from "../lib/typeFilter";
import { FilterChips, TypeFilter } from "./TypeFilter";

afterEach(() => cleanup());

describe("Types popover", () => {
  it("offers the supported import types, including jpg and jpeg as one row", () => {
    const onSelectedIds = vi.fn();
    render(<TypeFilter types={mergeTypeCounts([])} selectedIds={[]} onSelectedIds={onSelectedIds} />);
    fireEvent.click(screen.getByRole("button", { name: "File Types" }));
    const options = screen.getAllByRole("option").map((option) => option.parentElement?.textContent ?? "");
    expect(options).toHaveLength(SUPPORTED_TYPE_GROUPS.length);
    for (const group of SUPPORTED_TYPE_GROUPS) {
      expect(screen.getByText(group.label)).toBeTruthy();
    }
    expect(screen.getAllByText("jpg / jpeg")).toHaveLength(1);
    expect(screen.queryByText("lychee")).toBeNull();
    expect(screen.queryByText("jpeg")).toBeNull();
    expect(screen.getByPlaceholderText("Filter types")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Any" })).toBeNull();
    expect(screen.queryByRole("button", { name: "All" })).toBeNull();

    fireEvent.click(screen.getByRole("option", { name: /^stl/ }));
    expect(onSelectedIds).toHaveBeenCalledWith(["stl"]);
  });

  it("moves with the arrow keys and clears the selection", () => {
    const onSelectedIds = vi.fn();
    const types = mergeTypeCounts([]).slice(0, 3);
    render(<TypeFilter types={types} selectedIds={["stl"]} onSelectedIds={onSelectedIds} />);
    fireEvent.click(screen.getByRole("button", { name: "File Types (1)" }));
    expect(screen.queryByPlaceholderText("Filter types")).toBeNull();
    const dialog = screen.getByRole("dialog", { name: "Filter by type" });
    fireEvent.keyDown(dialog, { key: "ArrowDown" });
    fireEvent.keyDown(dialog, { key: " " });
    expect(onSelectedIds).toHaveBeenCalledWith(["stl", "obj"]);
    fireEvent.click(screen.getByRole("button", { name: "Select none" }));
    expect(onSelectedIds).toHaveBeenCalledWith([]);
  });

  it("selects all types when Select all is clicked", () => {
    const onSelectedIds = vi.fn();
    const types = mergeTypeCounts([]);
    const allIds = SUPPORTED_TYPE_GROUPS.map((group) => group.id);
    render(<TypeFilter types={types} selectedIds={["stl"]} onSelectedIds={onSelectedIds} />);
    fireEvent.click(screen.getByRole("button", { name: "File Types (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    const selected = onSelectedIds.mock.calls[0]?.[0] as string[];
    expect(selected).toHaveLength(allIds.length);
    expect(new Set(selected)).toEqual(new Set(allIds));
  });

  it("selects only visible types when Select all is clicked with a search filter", () => {
    const onSelectedIds = vi.fn();
    const types = mergeTypeCounts([]);
    render(<TypeFilter types={types} selectedIds={["stl"]} onSelectedIds={onSelectedIds} />);
    fireEvent.click(screen.getByRole("button", { name: "File Types (1)" }));
    fireEvent.change(screen.getByPlaceholderText("Filter types"), { target: { value: "obj" } });
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(onSelectedIds).toHaveBeenCalledWith(["stl", "obj"]);
  });

  it("moves arrow-up from the first highlight into the search field", () => {
    const focus = vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(() => undefined);
    const types = mergeTypeCounts([]);
    render(<TypeFilter types={types} selectedIds={[]} onSelectedIds={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "File Types" }));
    const dialog = screen.getByRole("dialog", { name: "Filter by type" });
    focus.mockClear();
    fireEvent.keyDown(dialog, { key: "ArrowUp" });
    expect(focus).toHaveBeenCalled();
    focus.mockRestore();
  });

  it("shows No types when the search matches nothing", () => {
    const types = mergeTypeCounts([]);
    render(<TypeFilter types={types} selectedIds={[]} onSelectedIds={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "File Types" }));
    fireEvent.change(screen.getByPlaceholderText("Filter types"), { target: { value: "zzz-no-match" } });
    expect(screen.getByText("No types")).toBeTruthy();
  });
});

describe("selected tag chips", () => {
  it("uses the tag color and readable text", () => {
    render(
      <FilterChips
        tags={[{ id: 4, name: "Skulls", fileCount: 3, color: "#6a3d8a" }]}
        types={[]}
        selectedTagIds={[4]}
        selectedTypeIds={[]}
        onSelectedTagIds={() => undefined}
        onSelectedTypeIds={() => undefined}
      />,
    );
    const chip = screen.getByRole("button", { name: "Remove Skulls" });
    expect(chip.style.backgroundColor).toBe("rgb(106, 61, 138)");
    expect(chip.style.color).toBe("rgb(255, 255, 255)");
  });
});
