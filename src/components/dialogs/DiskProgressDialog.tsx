import { Modal } from "./Modal";
import type { LibraryModel } from "../../hooks/useLibrary";
import { api } from "../../api";
import { formatBytes } from "../../hooks/libraryTypes";

export function DiskProgressDialog({ app }: { app: LibraryModel }) {
  const { diskDialog } = app;
  return (
    <>
      {diskDialog ? (
        <Modal>
          <div className="card" role="dialog" aria-busy="true" aria-label={diskDialog.title}>
            <div className="disk-title">
              <div className="spinner" />
              <h2>{diskDialog.title}</h2>
            </div>
            <p className="disk-name">
              {diskDialog.total > 0 ? `${diskDialog.current} of ${diskDialog.total}` : "Working..."}
              {diskDialog.name ? ` · ${diskDialog.name}` : ""}
              {diskDialog.bytesTotal > 0
                ? ` · ${formatBytes(diskDialog.bytesDone)} of ${formatBytes(diskDialog.bytesTotal)}`
                : ""}
            </p>
            <div className="progress-track">
              <div
                className={diskDialog.total > 0 ? "progress-bar" : "progress-bar indeterminate"}
                style={
                  diskDialog.total > 0
                    ? { width: `${Math.min(100, (diskDialog.current / diskDialog.total) * 100)}%` }
                    : undefined
                }
              />
            </div>
            {diskDialog.cancellable ? (
              <div className="row">
                <button type="button" onClick={() => void api.cancelDiskOp()}>Cancel</button>
              </div>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </>
  );
}
