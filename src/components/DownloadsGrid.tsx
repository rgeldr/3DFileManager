import { useMemo } from "react";
import { formatBytes } from "../hooks/libraryTypes";
import { formatFileDate } from "./FileGridRows";
import type { DownloadRow } from "../types";
import {
  DEFAULT_DOWNLOAD_SORT,
  sortedDownloadRows,
  type DownloadSort,
  type DownloadSortField,
} from "../lib/downloadsSort";
import { contextMenuDownloadSelection, downloadSelectMode, selectDownloadPath } from "../lib/downloadsSelection";

const DOWNLOADS_COLUMNS = "240px 200px 96px 176px 176px 128px";

export function DownloadsGrid({
  rows,
  sort = DEFAULT_DOWNLOAD_SORT,
  selected,
  onSelectionChange,
  onSort,
  onContextMenu,
}: {
  rows: DownloadRow[];
  sort?: DownloadSort;
  selected: string[];
  onSelectionChange: (paths: string[]) => void;
  onSort: (field: DownloadSortField) => void;
  onContextMenu: (event: React.MouseEvent, path: string, selection: string[]) => void;
}) {
  const sorted = useMemo(() => sortedDownloadRows(rows, sort), [rows, sort]);
  const orderedPaths = useMemo(() => sorted.map((row) => row.absolutePath), [sorted]);

  const header = (
    field: DownloadSortField,
    label: string,
    className: string,
  ) => {
    const active = sort.field === field;
    const ariaSort = active ? (sort.direction === "asc" ? "ascending" : "descending") : "none";
    return (
      <div className={`details-header-cell ${className}${active ? " active" : ""}`} role="columnheader" aria-sort={ariaSort}>
        <button type="button" className="details-header-sort" onClick={() => onSort(field)}>
          <span>{label}</span>
          {active ? <span className="sort-arrow" aria-hidden>{sort.direction === "asc" ? "▲" : "▼"}</span> : null}
        </button>
      </div>
    );
  };

  return (
    <div className="downloads-grid details-view" style={{ ["--details-columns" as string]: DOWNLOADS_COLUMNS }}>
      <div className="details-header" data-sort-header>
        {header("name", "Name", "details-col-name")}
        {header("path", "Path", "details-col-path")}
        {header("size", "Size", "details-col-size")}
        {header("modified", "Date modified", "details-col-date")}
        <div className="details-header-cell details-col-date" role="columnheader">
          <span className="details-header-sort muted">Date added</span>
        </div>
        <div className="details-header-cell details-col-creator" role="columnheader">
          <span className="details-header-sort muted">Creator</span>
        </div>
      </div>
      {sorted.map((row) => {
        const isSelected = selected.includes(row.absolutePath);
        return (
          <button
            key={row.absolutePath}
            type="button"
            className={`file-row details-row${isSelected ? " selected" : ""}`}
            data-download-path={row.absolutePath}
            title={row.absolutePath}
            draggable={false}
            onDragStart={(event) => event.preventDefault()}
            onClick={(event) => {
              onSelectionChange(selectDownloadPath(orderedPaths, selected, row.absolutePath, downloadSelectMode(event)));
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              const next = contextMenuDownloadSelection(selected, row.absolutePath);
              onSelectionChange(next);
              onContextMenu(event, row.absolutePath, next);
            }}
          >
            <span className="details-col-name file-row-label">{row.name}</span>
            <span className="details-col-path">{row.relativeDir}</span>
            <span className="details-col-size">{formatBytes(row.sizeBytes)}</span>
            <span className="details-col-date">{formatFileDate(row.mtime)}</span>
            <span className="details-col-date" />
            <span className="details-col-creator" />
          </button>
        );
      })}
    </div>
  );
}
