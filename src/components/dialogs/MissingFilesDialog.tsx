import { Modal } from "./Modal";
import type { LibraryModel } from "../../hooks/useLibrary";
import { api } from "../../api";

export function MissingFilesDialog({ app }: { app: LibraryModel }) {
  const { missingOpen, setMissingOpen, missingFiles, refreshLists } = app;
  return (
    <>
      {missingOpen ? (
        <Modal>
          <div className="card">
            <h2>Missing files</h2>
            {missingFiles.map((file) => <p key={file.id}>{file.sortName}</p>)}
            <div className="row">
              <button type="button" onClick={() => setMissingOpen(false)}>Close</button>
              <button
                type="button"
                onClick={() => {
                  void api.removeMissing().then(() => refreshLists()).finally(() => setMissingOpen(false));
                }}
              >
                Remove entries
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
