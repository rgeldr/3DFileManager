import { formatBytes } from "../hooks/libraryTypes";
import type { FileRow, FolderRow, LibrarySort, SortField } from "../types";

export function fileDisplayName(file: FileRow) {
  return `${file.sortName}.${file.ext}`;
}

export function formatFileDate(seconds: number) {
  return new Date(seconds * 1000).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

const SORT_COLUMNS: { field: SortField; label: string; className: string }[] = [
  { field: "name", label: "Name", className: "details-col-name" },
  { field: "size", label: "Size", className: "details-col-size" },
  { field: "modified", label: "Date modified", className: "details-col-date" },
  { field: "date", label: "Date added", className: "details-col-date" },
  { field: "creator", label: "Creator", className: "details-col-creator" },
];

export function DetailsHeader({
  sort,
  onSort,
}: {
  sort: LibrarySort;
  onSort: (field: SortField) => void;
}) {
  return (
    <div className="details-header" data-sort-header>
      {SORT_COLUMNS.map((column) => {
        const active = sort.field === column.field;
        const ariaSort = active ? (sort.direction === "asc" ? "ascending" : "descending") : "none";
        return (
          <button
            key={column.field}
            type="button"
            className={`details-header-cell ${column.className}${active ? " active" : ""}`}
            aria-sort={ariaSort}
            onClick={() => onSort(column.field)}
          >
            <span>{column.label}</span>
            {active ? <span className="sort-arrow" aria-hidden>{sort.direction === "asc" ? "▲" : "▼"}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function FolderBadge({ name }: { name: string }) {
  return (
    <span className="type-icon type-icon-txt folder-badge" title={name}>
      {name}
    </span>
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
      {isFolder ? <FolderBadge name={label} /> : null}
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
        <FolderBadge name={folder.name} />
      </span>
      <span className="details-col-size" />
      <span className="details-col-date" />
      <span className="details-col-date" />
      <span className="details-col-creator" />
    </button>
  );
}
