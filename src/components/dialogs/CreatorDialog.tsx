import { Modal } from "./Modal";
import type { LibraryModel } from "../../hooks/useLibrary";
import { api } from "../../api";

export function CreatorDialog({ app }: { app: LibraryModel }) {
  const { creators, creatorTarget, setCreatorTarget, creatorValue, setCreatorValue, includeSubfolders, setIncludeSubfolders, creatorFileCount, setError, refreshLists } = app;
  return (
    <>
      {creatorTarget ? (
        <Modal>
          <div className="card">
            <h2>Set creator</h2>
            <p>
              Set the creator on files in <strong>{creatorTarget.name}</strong>.
            </p>
            <label className="check-row">
              <input
                type="checkbox"
                checked={includeSubfolders}
                onChange={(event) => setIncludeSubfolders(event.target.checked)}
              />
              Include subfolders
            </label>
            {creatorFileCount === 0 ? <p className="muted">This folder has no files.</p> : null}
            {creatorFileCount != null && creatorFileCount > 0 ? (
              <p className="muted">{creatorFileCount} files will be updated.</p>
            ) : null}
            <input
              placeholder="Creator"
              list="folder-creators"
              value={creatorValue}
              autoFocus
              disabled={creatorFileCount === 0}
              onChange={(event) => setCreatorValue(event.target.value)}
            />
            <datalist id="folder-creators">
              {creators.map((item) => <option key={item} value={item} />)}
            </datalist>
            <div className="row">
              <button type="button" onClick={() => setCreatorTarget(null)}>Cancel</button>
              <button
                type="button"
                className="primary"
                disabled={creatorFileCount === 0 || creatorValue.trim() === ""}
                onClick={() => {
                  void api
                    .setCreatorUnderFolder(creatorTarget.folderId, creatorValue.trim(), includeSubfolders)
                    .then(() => refreshLists())
                    .catch((err) => setError(String(err)))
                    .finally(() => setCreatorTarget(null));
                }}
              >
                Apply
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
