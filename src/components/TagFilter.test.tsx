import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TagChips, TagFilter } from "./TagFilter";

afterEach(() => cleanup());

const tags = [
  { id: 1, name: "Angels", fileCount: 4 },
  { id: 2, name: "Bases", fileCount: 2 },
  { id: 3, name: "Creatures", fileCount: 9 },
];

describe("Tags popover", () => {
  it("opens, toggles a tag, and switches Any/All match mode", () => {
    const onSelectedIds = vi.fn();
    const onMatch = vi.fn();
    render(
      <TagFilter tags={tags} selectedIds={[]} match="any" onSelectedIds={onSelectedIds} onMatch={onMatch} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Tags" }));
    expect(screen.getByRole("dialog", { name: "Filter by tags" })).toBeTruthy();
    expect(screen.getByPlaceholderText("Filter tags")).toBeTruthy();

    fireEvent.click(screen.getByRole("option", { name: /^Angels/ }));
    expect(onSelectedIds).toHaveBeenCalledWith([1]);

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(onMatch).toHaveBeenCalledWith("all");
    fireEvent.click(screen.getByRole("button", { name: "Any" }));
    expect(onMatch).toHaveBeenCalledWith("any");
  });

  it("moves with the arrow keys and clears the selection", () => {
    const onSelectedIds = vi.fn();
    render(
      <TagFilter tags={tags} selectedIds={[1]} match="any" onSelectedIds={onSelectedIds} onMatch={() => undefined} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Tags (1)" }));
    const dialog = screen.getByRole("dialog", { name: "Filter by tags" });
    fireEvent.keyDown(dialog, { key: "ArrowDown" });
    fireEvent.keyDown(dialog, { key: " " });
    expect(onSelectedIds).toHaveBeenCalledWith([1, 2]);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onSelectedIds).toHaveBeenCalledWith([]);
  });

  it("moves arrow-up from the first highlight into the search field", () => {
    const focus = vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(() => undefined);
    render(
      <TagFilter tags={tags} selectedIds={[]} match="any" onSelectedIds={() => undefined} onMatch={() => undefined} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Tags" }));
    const dialog = screen.getByRole("dialog", { name: "Filter by tags" });
    focus.mockClear();
    fireEvent.keyDown(dialog, { key: "ArrowUp" });
    expect(focus).toHaveBeenCalled();
    focus.mockRestore();
  });

  it("shows No tags when the search matches nothing", () => {
    render(
      <TagFilter tags={tags} selectedIds={[]} match="any" onSelectedIds={() => undefined} onMatch={() => undefined} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Tags" }));
    fireEvent.change(screen.getByPlaceholderText("Filter tags"), { target: { value: "zzz" } });
    expect(screen.getByText("No tags")).toBeTruthy();
  });
});

describe("TagChips", () => {
  it("removes a selected tag when the chip is clicked", () => {
    const onSelectedIds = vi.fn();
    render(
      <TagChips
        tags={[{ id: 4, name: "Skulls", fileCount: 3, color: "#6a3d8a" }]}
        selectedIds={[4]}
        onSelectedIds={onSelectedIds}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove Skulls" }));
    expect(onSelectedIds).toHaveBeenCalledWith([]);
  });
});
