import { useEffect, useRef, useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TagCount, TypeCount } from "../types";
import { LibrarySearch } from "./LibrarySearch";

afterEach(() => cleanup());

const tags: TagCount[] = [{ id: 1, name: "Humans", fileCount: 2 }];
const types: TypeCount[] = [{ id: "stl", label: "stl", exts: ["stl"], fileCount: 1 }];

function renderSearch(overrides: Partial<Parameters<typeof LibrarySearch>[0]> = {}) {
  const onQuery = vi.fn();
  const onClear = vi.fn();
  const onScope = vi.fn();
  const view = render(
    <LibrarySearch
      query=""
      creator=""
      selectedTagIds={[]}
      selectedTypeIds={[]}
      tags={tags}
      types={types}
      scope="library"
      onScope={onScope}
      onQuery={onQuery}
      onClear={onClear}
      onSelectedTagIds={() => undefined}
      onSelectedTypeIds={() => undefined}
      {...overrides}
    />,
  );
  return { ...view, onQuery, onClear, onScope };
}

describe("Clear filters", () => {
  it("sits beside search and stays disabled until a filter is active", () => {
    const view = renderSearch();
    const button = screen.getByRole("button", { name: "Clear filters" });
    const input = screen.getByLabelText("Search");
    expect(button.title).toBe("Clear search, file types, tags and creator");
    expect(button.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(button.closest(".toolbar-search-row")).toBe(input.parentElement);
    expect((button as HTMLButtonElement).disabled).toBe(true);

    view.rerender(
      <LibrarySearch
        query="lion"
        creator=""
        selectedTagIds={[]}
        selectedTypeIds={[]}
        tags={tags}
        types={types}
        scope="library"
        onScope={view.onScope}
        onQuery={view.onQuery}
        onClear={view.onClear}
        onSelectedTagIds={() => undefined}
        onSelectedTypeIds={() => undefined}
      />,
    );
    expect((screen.getByRole("button", { name: "Clear filters" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("clears search, file types, tags, and creator in one update", () => {
    const refreshes = { current: 0 };
    function Harness() {
      const [query, setQuery] = useState("lion");
      const [creator, setCreator] = useState("Flexi Factory");
      const [selectedTypeIds, setSelectedTypeIds] = useState(["stl"]);
      const [selectedTagIds, setSelectedTagIds] = useState([1]);
      const skip = useRef(true);
      useEffect(() => {
        if (skip.current) {
          skip.current = false;
          return;
        }
        refreshes.current += 1;
      }, [query, creator, selectedTypeIds, selectedTagIds]);
      return (
        <LibrarySearch
          query={query}
          creator={creator}
          selectedTagIds={selectedTagIds}
          selectedTypeIds={selectedTypeIds}
          tags={tags}
          types={types}
          onQuery={setQuery}
          onClear={() => {
            setQuery("");
            setCreator("");
            setSelectedTypeIds([]);
            setSelectedTagIds([]);
          }}
          onSelectedTagIds={setSelectedTagIds}
          onSelectedTypeIds={setSelectedTypeIds}
          scope="library"
          onScope={() => undefined}
        />
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(refreshes.current).toBe(1);
    expect((screen.getByLabelText("Search") as HTMLInputElement).value).toBe("");
    expect((screen.getByRole("button", { name: "Clear filters" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("lets Escape clear only the search text", () => {
    const { onQuery, onClear } = renderSearch({ query: "lion", selectedTypeIds: ["stl"], creator: "Flexi Factory" });
    fireEvent.keyDown(screen.getByLabelText("Search"), { key: "Escape" });
    expect(onQuery).toHaveBeenCalledTimes(1);
    expect(onQuery).toHaveBeenCalledWith("");
    expect(onClear).not.toHaveBeenCalled();

    cleanup();
    const empty = renderSearch();
    fireEvent.keyDown(screen.getByLabelText("Search"), { key: "Escape" });
    expect(empty.onQuery).not.toHaveBeenCalled();
    expect(empty.onClear).not.toHaveBeenCalled();
  });
});

describe("Search scope", () => {
  it("calls onScope when the folder radio is selected", () => {
    const { onScope } = renderSearch({ scope: "library" });
    fireEvent.click(screen.getByLabelText("Current folder"));
    expect(onScope).toHaveBeenCalledWith("folder");
  });
});
