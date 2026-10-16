import type { KeyboardEvent } from "react";
import { filtersActive } from "../lib/clearFilters";
import type { TagCount, TypeCount } from "../types";
import { FilterChips } from "./TypeFilter";

const CLEAR_TITLE = "Clear search, file types, tags and creator";

export function LibrarySearch({
  query,
  creator,
  selectedTagIds,
  selectedTypeIds,
  tags,
  types,
  onQuery,
  onClear,
  onSelectedTagIds,
  onSelectedTypeIds,
}: {
  query: string;
  creator: string;
  selectedTagIds: number[];
  selectedTypeIds: string[];
  tags: TagCount[];
  types: TypeCount[];
  onQuery: (query: string) => void;
  onClear: () => void;
  onSelectedTagIds: (ids: number[]) => void;
  onSelectedTypeIds: (ids: string[]) => void;
}) {
  const active = filtersActive({ query, creator, selectedTypeIds, selectedTagIds });
  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Escape" || query === "") return;
    event.preventDefault();
    event.stopPropagation();
    onQuery("");
  };

  return (
    <div className="toolbar-search">
      <div className="toolbar-search-row">
        <input
          type="search"
          placeholder="Search"
          aria-label="Search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={onSearchKeyDown}
        />
        <button
          type="button"
          className="toolbar-clear"
          title={CLEAR_TITLE}
          aria-label="Clear filters"
          disabled={!active}
          onClick={onClear}
        >
          Clear
        </button>
      </div>
      <FilterChips
        tags={tags}
        types={types}
        selectedTagIds={selectedTagIds}
        selectedTypeIds={selectedTypeIds}
        onSelectedTagIds={onSelectedTagIds}
        onSelectedTypeIds={onSelectedTypeIds}
      />
    </div>
  );
}
