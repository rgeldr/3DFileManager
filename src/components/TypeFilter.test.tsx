import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SUPPORTED_TYPE_GROUPS, mergeTypeCounts } from "../lib/typeFilter";
import { TypeFilter } from "./TypeFilter";

afterEach(() => cleanup());

describe("Types popover", () => {
  it("offers the supported import types, including jpg and jpeg as one row", () => {
    const onSelectedIds = vi.fn();
    render(<TypeFilter types={mergeTypeCounts([])} selectedIds={[]} onSelectedIds={onSelectedIds} />);
    fireEvent.click(screen.getByRole("button", { name: "Types" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Types (1)" }));
    expect(screen.queryByPlaceholderText("Filter types")).toBeNull();
    const dialog = screen.getByRole("dialog", { name: "Filter by type" });
    fireEvent.keyDown(dialog, { key: "ArrowDown" });
    fireEvent.keyDown(dialog, { key: " " });
    expect(onSelectedIds).toHaveBeenCalledWith(["stl", "obj"]);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onSelectedIds).toHaveBeenCalledWith([]);
  });
});
