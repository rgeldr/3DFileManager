import { Modal } from "./Modal";
import type { LibraryModel } from "../../hooks/useLibrary";
import { ImportMetaFields } from "../ImportMetaFields";
import { FolderPicker } from "../FolderPicker";
import { browseToFolderId, downloadsDestinationKey } from "../../lib/downloadsImport";
import { isTypingTarget } from "../../lib/deleteKey";
import { normalizePickerBrowse, pickerParentPlace, resolvePickerBrowse } from "../../lib/folderPicker";
import type { Browse } from "../../types";
import { useEffect, useRef, useState } from "react";

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
  const defaultKey = downloadsDestinationKey(normalizePickerBrowse(defaultPlace));
  const pathKey = paths.join("\0");
  const [browse, setBrowse] = useState<Browse>(() => normalizePickerBrowse(defaultPlace));
  const submitLock = useRef(false);
  const place = resolvePickerBrowse(folders, browse);

  useEffect(() => {
    setBrowse(normalizePickerBrowse(defaultPlace));
  }, [defaultKey, pathKey]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Backspace" || isTypingTarget(event.target)) return;
      event.preventDefault();
      setBrowse((current) => {
        const resolved = resolvePickerBrowse(folders, current);
        return pickerParentPlace(folders, resolved) ?? resolved;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, folders]);

  if (paths.length === 0) return null;

  return (
    <Modal>
      <div className="card card-add-library">
        <h2>Add to library</h2>
        <p>
          {paths.length === 1 ? "1 file" : `${paths.length} files`} will be copied into the library.
        </p>
        <FolderPicker
          folders={folders}
          libraryName={libraryName}
          browse={place}
          onBrowseChange={setBrowse}
        />
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
              if (submitLock.current) return;
              submitLock.current = true;
              void runDownloadsImport(paths, browseToFolderId(place)).then((started) => {
                if (started) onClose();
                else submitLock.current = false;
              });
            }}
          >
            Add to library
          </button>
        </div>
      </div>
    </Modal>
  );
}
