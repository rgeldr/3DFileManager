import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import {
  filterTagOptions,
  moveTagHighlight,
  tagFilterBadge,
  tagFilterKeyAction,
  toggleTagId,
} from "../lib/tagFilter";
import type { TagCount, TagMatchMode } from "../types";

export function TagFilter({
  tags,
  selectedIds,
  match,
  onSelectedIds,
  onMatch,
}: {
  tags: TagCount[];
  selectedIds: number[];
  match: TagMatchMode;
  onSelectedIds: (ids: number[]) => void;
  onMatch: (match: TagMatchMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [highlight, setHighlight] = useState(0);
  const anchorRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const visible = filterTagOptions(tags, filter);

  useEffect(() => {
    if (!open) {
      setFilter("");
      setHighlight(0);
      return;
    }
    searchRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!anchorRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(".is-highlight")?.scrollIntoView?.({ block: "nearest" });
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
      if (action === "up" && highlight === 0 && !inSearch) {
        searchRef.current?.focus();
        return;
      }
      setHighlight((index) => moveTagHighlight(index, visible.length, action));
      if (inSearch) listRef.current?.focus();
      return;
    }
    const tag = visible[highlight];
    if (tag) onSelectedIds(toggleTagId(selectedIds, tag.id));
  };

  return (
      <div className="tag-filter-anchor" ref={anchorRef}>
        <button
          type="button"
          className={selectedIds.length > 0 ? "tag-filter-button is-active" : "tag-filter-button"}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-controls={listId}
          onClick={() => setOpen((value) => !value)}
        >
          {tagFilterBadge(selectedIds.length)}
        </button>
        {open ? (
          <div
            className="tag-filter-popover"
            role="dialog"
            aria-label="Filter by tags"
            onKeyDown={onKeyDown}
          >
            <input
              ref={searchRef}
              type="search"
              placeholder="Filter tags"
              value={filter}
              aria-controls={listId}
              onChange={(event) => {
                setFilter(event.target.value);
                setHighlight(0);
              }}
            />
            <div
              className="tag-filter-list"
              id={listId}
              ref={listRef}
              role="listbox"
              aria-multiselectable="true"
              tabIndex={-1}
            >
              {visible.length === 0 ? <div className="tag-filter-empty">No tags</div> : null}
              {visible.map((tag, index) => (
                <label
                  key={tag.id}
                  className={index === highlight ? "tag-filter-row is-highlight" : "tag-filter-row"}
                  onMouseEnter={() => setHighlight(index)}
                >
                  <input
                    type="checkbox"
                    role="option"
                    aria-selected={selectedIds.includes(tag.id)}
                    checked={selectedIds.includes(tag.id)}
                    onChange={() => onSelectedIds(toggleTagId(selectedIds, tag.id))}
                  />
                  <span className="tag-filter-name">{tag.name}</span>
                  <span className="tag-filter-count">{tag.fileCount}</span>
                </label>
              ))}
            </div>
            <div className="tag-filter-match">
              <span>Match:</span>
              <button type="button" aria-pressed={match === "any"} onClick={() => onMatch("any")}>Any</button>
              <button type="button" aria-pressed={match === "all"} onClick={() => onMatch("all")}>All</button>
              <button type="button" className="tag-filter-clear" onClick={() => onSelectedIds([])}>Clear</button>
            </div>
          </div>
        ) : null}
      </div>
  );
}

export function TagChips({
  tags,
  selectedIds,
  onSelectedIds,
}: {
  tags: TagCount[];
  selectedIds: number[];
  onSelectedIds: (ids: number[]) => void;
}) {
  const selected = tags.filter((tag) => selectedIds.includes(tag.id));
  if (selected.length === 0) return null;
  return (
    <div className="tag-filter-chips">
      {selected.map((tag) => (
        <button
          key={tag.id}
          type="button"
          className="tag"
          aria-label={`Remove ${tag.name}`}
          onClick={() => onSelectedIds(toggleTagId(selectedIds, tag.id))}
        >
          {tag.name} ×
        </button>
      ))}
    </div>
  );
}
