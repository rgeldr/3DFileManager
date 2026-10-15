import { Modal } from "./Modal";
import type { LibraryModel } from "../../hooks/useLibrary";
import { api } from "../../api";

export function FolderTagDialog({ app }: { app: LibraryModel }) {
  const { tags, folderTagTarget, setFolderTagTarget, folderTagInput, setFolderTagInput, folderTagFileCount, setError, refreshLists } = app;
  return (
    <>
      {folderTagTarget ? (
        <Modal>
          <div className="card">
            <h2>Tag folder contents</h2>
            <p>
              Add tags to every file in <strong>{folderTagTarget.name}</strong> and its subfolders.
              Tags already on those files are kept.
            </p>
            {folderTagFileCount === 0 ? <p className="muted">This folder has no files.</p> : null}
            {folderTagFileCount != null && folderTagFileCount > 0 ? (
              <p className="muted">{folderTagFileCount} files will be updated.</p>
            ) : null}
            <input
              placeholder="Tags, separated by commas"
              value={folderTagInput}
              list="folder-tag-suggestions"
              autoFocus
              disabled={folderTagFileCount === 0}
              onChange={(event) => setFolderTagInput(event.target.value)}
            />
            <datalist id="folder-tag-suggestions">
              {tags.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
            <div className="row">
              <button type="button" onClick={() => setFolderTagTarget(null)}>Cancel</button>
              <button
                type="button"
                className="primary"
                disabled={folderTagFileCount === 0}
                onClick={() => {
                  const nextTags = folderTagInput
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean);
                  if (!nextTags.length) {
                    setFolderTagTarget(null);
                    return;
                  }
                  void api
                    .addTagsUnderFolder(folderTagTarget.folderId, nextTags)
                    .then(() => refreshLists())
                    .catch((err) => setError(String(err)))
                    .finally(() => setFolderTagTarget(null));
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
