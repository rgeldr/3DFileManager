import type { DownloadRow } from "../types";
import { formatBytes } from "../hooks/libraryTypes";
import { formatFileDate } from "../components/FileGridRows";
import { PinIcon } from "./Inspector";

export function DownloadsInspector({
  row,
  pinned,
  onPinnedChange,
}: {
  row: DownloadRow | null;
  pinned: boolean;
  onPinnedChange: (pinned: boolean) => void;
}) {
  return (
    <aside className={`inspector${pinned ? "" : " collapsed"}`} data-pinned={pinned ? "true" : "false"}>
      <div className="inspector-head">
        <h2>Details</h2>
        <button
          type="button"
          className="inspector-pin"
          aria-pressed={pinned}
          aria-label={pinned ? "Unpin details" : "Pin details open"}
          onClick={() => onPinnedChange(!pinned)}
        >
          <PinIcon pinned={pinned} />
        </button>
      </div>
      {row ? (
        <div className="inspector-body downloads-inspector">
          <dl>
            <div>
              <dt>Name</dt>
              <dd>{row.name}</dd>
            </div>
            <div>
              <dt>Path</dt>
              <dd>{row.relativeDir || "(Downloads root)"}</dd>
            </div>
            <div>
              <dt>Full path</dt>
              <dd className="mono">{row.absolutePath}</dd>
            </div>
            <div>
              <dt>Size</dt>
              <dd>{formatBytes(row.sizeBytes)}</dd>
            </div>
            <div>
              <dt>Modified</dt>
              <dd>{formatFileDate(row.mtime)}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <p className="muted inspector-empty">Select a downloaded file to see its details.</p>
      )}
    </aside>
  );
}
