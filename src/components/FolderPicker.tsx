import { useEffect, useId, useState, type KeyboardEvent } from "react";
import type { Browse, FolderRow } from "../types";
import { Breadcrumb } from "./Breadcrumb";
import { FolderIcon } from "./FileGridRows";
import {
  destinationDisplayPath,
  folderHasChildren,
  immediateChildFolders,
  pickerListKeyAction,
  pickerParentPlace,
} from "../lib/folderPicker";

export function FolderPicker({
  folders,
  libraryName,
  browse,
  onBrowseChange,
}: {
  folders: FolderRow[];
  libraryName: string;
  browse: Browse;
  onBrowseChange: (place: Browse) => void;
}) {
  const listId = useId();
  const children = immediateChildFolders(folders, browse);
  const [focusIndex, setFocusIndex] = useState(-1);

  useEffect(() => {
    setFocusIndex(-1);
  }, [browse]);

  const stepUp = () => {
    const parent = pickerParentPlace(folders, browse);
    if (parent) onBrowseChange(parent);
  };

  const stepInto = (folderId: number) => {
    onBrowseChange({ type: "folder", id: folderId });
  };

  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const action = pickerListKeyAction({
      key: event.key,
      focusIndex,
      childCount: children.length,
      children,
    });
    if (!action) return;
    event.preventDefault();
    if (action.type === "focus") {
      setFocusIndex(action.index);
      return;
    }
    if (action.type === "enter") {
      stepInto(action.folderId);
      return;
    }
    stepUp();
  };

  return (
    <div className="folder-picker">
      <div className="folder-picker-toolbar">
        <Breadcrumb libraryName={libraryName} folders={folders} browse={browse} onNavigate={onBrowseChange} />
        <button
          type="button"
          className="folder-picker-up"
          aria-label="Up one folder"
          disabled={browse.type === "root"}
          onClick={stepUp}
        >
          Up
        </button>
      </div>
      <p className="folder-picker-destination">
        Copy into: <span title={destinationDisplayPath(libraryName, folders, browse)}>{destinationDisplayPath(libraryName, folders, browse)}</span>
      </p>
      <div
        id={listId}
        className="folder-picker-list"
        role="listbox"
        aria-label="Destination folder"
        tabIndex={0}
        onKeyDown={onListKeyDown}
      >
        {children.length === 0 ? (
          <p className="muted folder-picker-empty">No subfolders here.</p>
        ) : (
          children.map((folder, index) => {
            const focused = index === focusIndex;
            return (
              <div
                key={folder.id}
                className={`folder-picker-row${focused ? " focused" : ""}`}
                role="option"
                aria-selected={focused}
                tabIndex={-1}
              >
                <button
                  type="button"
                  className="tree-twist"
                  aria-label={`Open ${folder.name}`}
                  onClick={() => stepInto(folder.id)}
                >
                  <span className={`tree-twist-icon${folderHasChildren(folders, folder.id) ? " open" : ""}`} aria-hidden />
                </button>
                <FolderIcon size={16} />
                <button
                  type="button"
                  className="folder-picker-name"
                  title={folder.name}
                  onClick={() => stepInto(folder.id)}
                >
                  {folder.name}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
