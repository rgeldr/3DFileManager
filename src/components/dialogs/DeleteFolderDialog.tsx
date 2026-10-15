import { Modal } from "./Modal";
import type { LibraryModel } from "../../hooks/useLibrary";

export function DeleteFolderDialog({ app }: { app: LibraryModel }) {
  const { deleteConfirm, setDeleteConfirm, performDeleteFolder } = app;
  return (
    <>
      {deleteConfirm ? (
        <Modal>
          <div className="card">
            <h2>Delete folder?</h2>
            <p>
              Delete <strong>{deleteConfirm.name}</strong>? The folder must be empty. This cannot be undone.
            </p>
            <div className="row">
              <button type="button" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  const { id, name } = deleteConfirm;
                  setDeleteConfirm(null);
                  performDeleteFolder(id, name);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
