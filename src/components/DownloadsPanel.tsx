import { open } from "@tauri-apps/plugin-dialog";
import type { ListDownloadsResult } from "../types";
import { DownloadsGrid } from "./DownloadsGrid";
import type { DownloadSort, DownloadSortField } from "../lib/downloadsSort";
import { DEFAULT_DOWNLOAD_SORT } from "../lib/downloadsSort";

export function DownloadsPanel({
  list,
  sort,
  onSort,
  selected,
  onSelectionChange,
  onContextMenu,
  onSetFolder,
  onClearFolder,
}: {
  list: ListDownloadsResult;
  sort: DownloadSort;
  onSort: (field: DownloadSortField) => void;
  selected: string[];
  onSelectionChange: (paths: string[]) => void;
  onContextMenu: (event: React.MouseEvent, path: string, selection: string[]) => void;
  onSetFolder: () => void;
  onClearFolder: () => void;
}) {
  if (list.status === "unset") {
    return (
      <div className="empty-state">
        <p>No Downloads folder is set yet.</p>
        <button type="button" className="primary" onClick={onSetFolder}>
          Set Downloads folder…
        </button>
      </div>
    );
  }
  if (list.status === "missing") {
    return (
      <div className="empty-state">
        <p>The saved Downloads folder is missing or is not a folder.</p>
        <button type="button" className="primary" onClick={onSetFolder}>
          Set Downloads folder…
        </button>
        <button type="button" onClick={onClearFolder}>
          Clear saved path
        </button>
      </div>
    );
  }
  if (list.rows.length === 0) {
    return (
      <div className="empty-state">
        <p>No compatible files found in the Downloads folder.</p>
        <button type="button" onClick={onSetFolder}>
          Change Downloads folder…
        </button>
      </div>
    );
  }
  return (
    <DownloadsGrid
      rows={list.rows}
      sort={sort}
      selected={selected}
      onSelectionChange={onSelectionChange}
      onSort={onSort}
      onContextMenu={onContextMenu}
    />
  );
}

export async function pickDownloadsFolder(): Promise<string | null> {
  const path = await open({ directory: true, multiple: false });
  return typeof path === "string" ? path : null;
}

export function nextDownloadSort(current: DownloadSort, field: DownloadSortField): DownloadSort {
  if (current.field !== field) {
    const direction = field === "name" || field === "path" ? "asc" : "desc";
    return { field, direction };
  }
  return { field, direction: current.direction === "asc" ? "desc" : "asc" };
}

export { DEFAULT_DOWNLOAD_SORT };
