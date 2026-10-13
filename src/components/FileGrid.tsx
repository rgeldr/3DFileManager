import { convertFileSrc } from "@tauri-apps/api/core";
import type { FileRow, GridSize } from "../types";

export function FileGrid({
  files,
  gridSize,
  selected,
  onSelect,
}: {
  files: FileRow[];
  gridSize: GridSize;
  selected: number[];
  onSelect: (id: number, mode: "replace" | "toggle" | "range") => void;
}) {
  if (files.length === 0) {
    return <div className="empty">This folder is empty. Drop files here to import them.</div>;
  }
  return (
    <div className={`grid ${gridSize}`}>
      {files.map((file) => {
        const title = [file.sortName, file.creator, file.tags.join(", ")].filter(Boolean).join(" · ");
        return (
          <button
            key={file.id}
            type="button"
            className={`tile${selected.includes(file.id) ? " selected" : ""}`}
            data-file-id={file.id}
            title={title}
            onClick={(event) => {
              const mode = event.shiftKey ? "range" : event.ctrlKey || event.metaKey ? "toggle" : "replace";
              onSelect(file.id, mode);
            }}
          >
            <div className="thumb">
              {file.thumbPath ? (
                <img src={convertFileSrc(file.thumbPath)} alt="" />
              ) : (
                <span className="type-icon">{file.ext.toUpperCase()}</span>
              )}
            </div>
            <div className="tile-name">{file.sortName}</div>
            <div className="tile-meta">{file.creator || file.ext}</div>
          </button>
        );
      })}
    </div>
  );
}
