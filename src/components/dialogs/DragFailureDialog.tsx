import { Modal } from "./Modal";
import type { LibraryModel } from "../../hooks/useLibrary";
import { api } from "../../api";
import { formatErrorForDisplay } from "../../hooks/libraryTypes";

export function DragFailureDialog({ app }: { app: LibraryModel }) {
  const { dragFailure, setDragFailure, setError } = app;
  return (
    <>
      {dragFailure ? (
        <Modal>
          <div className="card">
            <h2>Could not drag the file</h2>
            <p className="card-scroll">{formatErrorForDisplay(dragFailure.message)}</p>
            <div className="row">
              <button
                type="button"
                onClick={() => {
                  void api.openInDefaultApp(dragFailure.fileId).catch((err) => setError(String(err)));
                }}
              >
                Open
              </button>
              <button
                type="button"
                onClick={() => {
                  void api.revealFile(dragFailure.fileId).catch((err) => setError(String(err)));
                }}
              >
                Show in Explorer
              </button>
              <button type="button" className="primary" onClick={() => setDragFailure(null)}>Close</button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
