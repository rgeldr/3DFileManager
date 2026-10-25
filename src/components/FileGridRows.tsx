import { formatBytes } from "../hooks/libraryTypes";
import {
  columnResizeWidth,
  DETAILS_COLUMN_LIMITS,
  type DetailsColumnId,
  type DetailsColumns,
} from "../lib/detailsColumns";
import type { FileRow, FolderRow, LibrarySort, SortField } from "../types";

export function fileDisplayName(file: FileRow) {
  return `${file.sortName}.${file.ext}`;
}

export function formatFileDate(seconds: number) {
  return new Date(seconds * 1000).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

const SORT_COLUMNS: { id: DetailsColumnId; field: SortField; label: string; className: string }[] = [
  { id: "name", field: "name", label: "Name", className: "details-col-name" },
  { id: "size", field: "size", label: "Size", className: "details-col-size" },
  { id: "modified", field: "modified", label: "Date modified", className: "details-col-date" },
  { id: "added", field: "date", label: "Date added", className: "details-col-date" },
  { id: "creator", field: "creator", label: "Creator", className: "details-col-creator" },
];

export function DetailsHeader({
  sort,
  columns,
  onSort,
  onColumnResize,
  onColumnResizeEnd,
}: {
  sort: LibrarySort;
  columns: DetailsColumns;
  onSort: (field: SortField) => void;
  onColumnResize?: (id: DetailsColumnId, width: number) => void;
  onColumnResizeEnd?: (id: DetailsColumnId, width: number) => void;
}) {
  const startResize = (event: React.PointerEvent<HTMLDivElement>, id: DetailsColumnId) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.detail >= 2) {
      onColumnResizeEnd?.(id, DETAILS_COLUMN_LIMITS[id].default);
      return;
    }
    const handle = event.currentTarget;
    const startX = event.clientX;
    const cell = handle.parentElement;
    const rendered = cell instanceof HTMLElement ? cell.getBoundingClientRect().width : 0;
    const saved = columns[id];
    const widthAt = (clientX: number) => columnResizeWidth(id, rendered, saved, clientX - startX);
    handle.setPointerCapture?.(event.pointerId);
    const move = (ev: PointerEvent) => {
      if (ev.clientX === startX) return;
      onColumnResize?.(id, widthAt(ev.clientX));
    };
    const finish = (ev: PointerEvent) => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", finish);
      if (handle.hasPointerCapture?.(ev.pointerId)) handle.releasePointerCapture(ev.pointerId);
      if (ev.clientX === startX) return;
      onColumnResizeEnd?.(id, widthAt(ev.clientX));
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
  };

  return (
    <div className="details-header" data-sort-header>
      {SORT_COLUMNS.map((column) => {
        const active = sort.field === column.field;
        const ariaSort = active ? (sort.direction === "asc" ? "ascending" : "descending") : "none";
        return (
          <div
            key={column.id}
            className={`details-header-cell ${column.className}${active ? " active" : ""}`}
            role="columnheader"
            aria-sort={ariaSort}
          >
            <button type="button" className="details-header-sort" onClick={() => onSort(column.field)}>
              <span>{column.label}</span>
              {active ? <span className="sort-arrow" aria-hidden>{sort.direction === "asc" ? "▲" : "▼"}</span> : null}
            </button>
            <div
              className="details-col-resize"
              role="separator"
              aria-orientation="vertical"
              aria-label={`Resize ${column.label}`}
              aria-valuemin={DETAILS_COLUMN_LIMITS[column.id].min}
              aria-valuemax={DETAILS_COLUMN_LIMITS[column.id].max}
              aria-valuenow={columns[column.id]}
              onPointerDown={(event) => startResize(event, column.id)}
            />
          </div>
        );
      })}
    </div>
  );
}

export function FolderIcon({ size, className }: { size?: number; className?: string }) {
  const classes = ["folder-icon", className].filter(Boolean).join(" ");
  return (
    <svg
      className={classes}
      width={size ?? undefined}
      height={size ?? undefined}
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"
      />
    </svg>
  );
}

export function ListRow({
  label,
  selected,
  isFolder,
  dataFileId,
  dataFolderId,
  onClick,
  onDoubleClick,
  onContextMenu,
}: {
  label: string;
  selected: boolean;
  isFolder: boolean;
  dataFileId?: number;
  dataFolderId?: number;
  onClick?: (event: React.MouseEvent) => void;
  onDoubleClick?: (event: React.MouseEvent) => void;
  onContextMenu?: (event: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      className={`file-row list-row${selected ? " selected" : ""}${isFolder ? " folder-row-item" : ""}`}
      data-file-id={dataFileId}
      data-folder-id={dataFolderId}
      title={label}
      draggable={false}
      onDragStart={(event) => event.preventDefault()}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      {isFolder ? <FolderIcon size={16} /> : null}
      <span className="file-row-label">{label}</span>
    </button>
  );
}

export function DetailsRow({
  file,
  selected,
  onClick,
  onDoubleClick,
  onContextMenu,
}: {
  file: FileRow;
  selected: boolean;
  onClick?: (event: React.MouseEvent) => void;
  onDoubleClick?: (event: React.MouseEvent) => void;
  onContextMenu?: (event: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      className={`file-row details-row${selected ? " selected" : ""}`}
      data-file-id={file.id}
      title={fileDisplayName(file)}
      draggable={false}
      onDragStart={(event) => event.preventDefault()}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <span className="details-col-name file-row-label">{fileDisplayName(file)}</span>
      <span className="details-col-size">{formatBytes(file.sizeBytes)}</span>
      <span className="details-col-date">{formatFileDate(file.mtime)}</span>
      <span className="details-col-date">{formatFileDate(file.importedAt)}</span>
      <span className="details-col-creator">{file.creator || ""}</span>
    </button>
  );
}

export function DetailsFolderRow({
  folder,
  onDoubleClick,
}: {
  folder: FolderRow;
  onDoubleClick?: (event: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      className="file-row details-row folder-row-item"
      data-folder-id={folder.id}
      title={folder.name}
      draggable={false}
      onDragStart={(event) => event.preventDefault()}
      onDoubleClick={onDoubleClick}
    >
      <span className="details-col-name">
        <FolderIcon size={16} />
        <span className="file-row-label">{folder.name}</span>
      </span>
      <span className="details-col-size" />
      <span className="details-col-date" />
      <span className="details-col-date" />
      <span className="details-col-creator" />
    </button>
  );
}
