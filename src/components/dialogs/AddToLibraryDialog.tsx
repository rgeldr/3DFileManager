import { Modal } from "./Modal";
import type { LibraryModel } from "../../hooks/useLibrary";
import { ImportMetaFields } from "../ImportMetaFields";
import { browseToFolderId, folderLabel } from "../../lib/downloadsImport";
import type { Browse, FolderRow } from "../../types";
import { useEffect, useMemo, useState } from "react";

export function folderOptions(folders: FolderRow[], libraryName: string): { id: string; label: string }[] {
  const sorted = [...folders].sort((a, b) => a.relpath.localeCompare(b.relpath, undefined, { numeric: true }));
  return [
    { id: "root", label: libraryName },
    ...sorted.map((folder) => ({ id: String(folder.id), label: folder.relpath.replace(/\\/g, "/") })),
  ];
}

export function AddToLibraryDialog({
  app,
  paths,
  defaultPlace,
  onClose,
}: {
  app: LibraryModel;
  paths: string[];
  defaultPlace: Browse;
  onClose: () => void;
}) {
  const {
    folders,
    libraryName,
    creators,
    tags,
    tagCounts,
    importCreator,
    setImportCreator,
    importTags,
    setImportTags,
    importTagText,
    setImportTagText,
    runDownloadsImport,
  } = app;
  const options = useMemo(() => folderOptions(folders, libraryName), [folders, libraryName]);
  const [folderKey, setFolderKey] = useState(
    defaultPlace.type === "folder" ? String(defaultPlace.id) : "root",
  );

  useEffect(() => {
    setFolderKey(defaultPlace.type === "folder" ? String(defaultPlace.id) : "root");
  }, [defaultPlace, paths.join("|")]);

  if (paths.length === 0) return null;

  const place: Browse = folderKey === "root" ? { type: "root" } : { type: "folder", id: Number(folderKey) };

  return (
    <Modal>
      <div className="card">
        <h2>Add to library</h2>
        <p>
          {paths.length === 1 ? "1 file" : `${paths.length} files`} will be copied into the library.
        </p>
        <label>
          Destination folder
          <select
            aria-label="Destination folder"
            value={folderKey}
            onChange={(event) => setFolderKey(event.target.value)}
          >
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <p className="muted">Destination: {folderLabel(folders, place, libraryName)}</p>
        <ImportMetaFields
          creators={creators}
          tags={tags}
          tagCounts={tagCounts}
          importCreator={importCreator}
          setImportCreator={setImportCreator}
          importTags={importTags}
          setImportTags={setImportTags}
          importTagText={importTagText}
          setImportTagText={setImportTagText}
          creatorListId="add-library-creators"
          tagListId="add-library-tags"
        />
        <div className="row">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => {
              void runDownloadsImport(paths, browseToFolderId(place)).then(onClose);
            }}
          >
            Add to library
          </button>
        </div>
      </div>
    </Modal>
  );
}
