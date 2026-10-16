import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { focusWithoutScroll, scrollListOption } from "../lib/popoverPosition";
import { moveTagHighlight, tagFilterKeyAction } from "../lib/tagFilter";
import {
  filterTypeOptions,
  toggleTypeId,
  typeFilterBadge,
  typeFilterShowsSearch,
} from "../lib/typeFilter";
import type { TagCount, TypeCount } from "../types";
import { AppErrorBoundary } from "./AppErrorBoundary";
import { FilterPopover } from "./FilterPopover";

export function TypeFilter({
  types,
  selectedIds,
  onSelectedIds,
}: {
  types: TypeCount[];
  selectedIds: string[];
  onSelectedIds: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [highlight, setHighlight] = useState(0);
  const anchorRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const showSearch = typeFilterShowsSearch(types.length);
  const visible = filterTypeOptions(types, showSearch ? filter : "");

  const focusRef = showSearch ? searchRef : listRef;

  useEffect(() => {
    if (!open) {
      setFilter("");
      setHighlight(0);
    }
  }, [open]);

  useEffect(() => {
    scrollListOption(listRef.current);
  }, [highlight, filter, open]);

  const onKeyDown = (event: KeyboardEvent) => {
    const target = event.target;
    const inSearch = target instanceof HTMLInputElement && target.type === "search";
    const onCheckbox = target instanceof HTMLInputElement && target.type === "checkbox";
    if (onCheckbox && (event.key === " " || event.key === "Spacebar")) return;
    const action = tagFilterKeyAction({
      key: event.key,
      inSearch,
      highlight,
      length: visible.length,
    });
    if (action === "type") return;
    event.preventDefault();
    if (action === "close") {
      setOpen(false);
      return;
    }
    if (action === "up" || action === "down") {
      if (action === "up" && highlight === 0 && !inSearch && showSearch) {
        focusWithoutScroll(searchRef.current);
        return;
      }
      setHighlight((index) => moveTagHighlight(index, visible.length, action));
      if (inSearch) focusWithoutScroll(listRef.current);
      return;
    }
    const type = visible[highlight];
    if (type) onSelectedIds(toggleTypeId(selectedIds, type.id));
  };

  return (
    <div className="tag-filter-anchor" ref={anchorRef}>
      <button
        type="button"
        className={selectedIds.length > 0 ? "tag-filter-button is-active" : "tag-filter-button"}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={listId}
        aria-label={typeFilterBadge(selectedIds.length)}
        onClick={() => setOpen((value) => !value)}
      >
        {typeFilterBadge(selectedIds.length)}
      </button>
      {open ? (
        <AppErrorBoundary title="The type filter could not open." onReset={() => setOpen(false)}>
        <FilterPopover
          anchorRef={anchorRef}
          label="Filter by type"
          layoutKey={`${filter}:${visible.length}`}
          onClose={() => setOpen(false)}
          onKeyDown={onKeyDown}
          focusRef={focusRef}
        >
          {showSearch ? (
            <input
              ref={searchRef}
              type="search"
              placeholder="Filter types"
              value={filter}
              aria-controls={listId}
              onChange={(event) => {
                setFilter(event.target.value);
                setHighlight(0);
              }}
            />
          ) : null}
          <div
            className="tag-filter-list"
            id={listId}
            ref={listRef}
            role="listbox"
            aria-multiselectable="true"
            tabIndex={-1}
          >
            {visible.length === 0 ? <div className="tag-filter-empty">No types</div> : null}
            {visible.map((type, index) => (
              <label
                key={type.id}
                className={index === highlight ? "tag-filter-row is-highlight" : "tag-filter-row"}
                onMouseEnter={() => setHighlight(index)}
              >
                <input
                  type="checkbox"
                  role="option"
                  aria-selected={selectedIds.includes(type.id)}
                  checked={selectedIds.includes(type.id)}
                  onChange={() => onSelectedIds(toggleTypeId(selectedIds, type.id))}
                />
                <span className="tag-filter-name">{type.label}</span>
                <span className="tag-filter-count">{type.fileCount}</span>
              </label>
            ))}
          </div>
          <div className="tag-filter-match">
            <button
              type="button"
              className="tag-filter-clear"
              onClick={() => onSelectedIds([...new Set([...selectedIds, ...visible.map((type) => type.id)])])}
            >
              Select all
            </button>
            <button type="button" onClick={() => onSelectedIds([])}>Select none</button>
          </div>
        </FilterPopover>
        </AppErrorBoundary>
      ) : null}
    </div>
  );
}

export function FilterChips({
  tags,
  types,
  selectedTagIds,
  selectedTypeIds,
  onSelectedTagIds,
  onSelectedTypeIds,
}: {
  tags: TagCount[];
  types: TypeCount[];
  selectedTagIds: number[];
  selectedTypeIds: string[];
  onSelectedTagIds: (ids: number[]) => void;
  onSelectedTypeIds: (ids: string[]) => void;
}) {
  const selectedTags = tags.filter((tag) => selectedTagIds.includes(tag.id));
  const selectedTypes = types.filter((type) => selectedTypeIds.includes(type.id));
  if (selectedTags.length === 0 && selectedTypes.length === 0) return null;
  return (
    <div className="tag-filter-chips">
      {selectedTypes.map((type) => (
        <button
          key={type.id}
          type="button"
          className="tag type-chip"
          aria-label={`Remove type ${type.label}`}
          onClick={() => onSelectedTypeIds(toggleTypeId(selectedTypeIds, type.id))}
        >
          {type.label} ×
        </button>
      ))}
      {selectedTags.map((tag) => (
        <button
          key={tag.id}
          type="button"
          className="tag"
          aria-label={`Remove ${tag.name}`}
          onClick={() => onSelectedTagIds(selectedTagIds.filter((id) => id !== tag.id))}
        >
          {tag.name} ×
        </button>
      ))}
    </div>
  );
}
