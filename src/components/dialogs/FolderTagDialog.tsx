import { Modal } from "./Modal";
import type { LibraryModel } from "../../hooks/useLibrary";
import { api } from "../../api";
import { commaTagOptions } from "../../lib/commaTags";

export function FolderTagDialog({ app }: { app: LibraryModel }) {
  const { tags, folderTagTarget, setFolderTagTarget, folderTagInput, setFolderTagInput, folderTagFileCount, setError, refreshLists } = app;
  const fileIds = folderTagTarget?.fileIds;
  return (
    <>
      {folderTagTarget ? (
        <Modal>
          <div className="card">
            <h2>{fileIds ? "Add tags" : "Tag folder contents"}</h2>
            <p>
              {fileIds ? (
                <>Add tags to <strong>{folderTagTarget.name}</strong>.</>
              ) : (
                <>Add tags to every file in <strong>{folderTagTarget.name}</strong> and its subfolders.</>
              )}
              {" "}Tags already on those files are kept.
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
              {commaTagOptions(folderTagInput, tags).map((item) => (
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
                  const run: Promise<unknown> = fileIds
                    ? api.addTagsToFiles(fileIds, nextTags)
                    : api.addTagsUnderFolder(folderTagTarget.folderId, nextTags);
                  void run
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
