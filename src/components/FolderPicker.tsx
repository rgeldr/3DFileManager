import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { Browse, FolderRow } from "../types";
import { Breadcrumb } from "./Breadcrumb";
import { FolderIcon } from "./FileGridRows";
import { isTypingTarget } from "../lib/deleteKey";
import {
  destinationDisplayPath,
  folderIdFromTarget,
  immediateChildFolders,
  pickerActivationFolderId,
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
  const listRef = useRef<HTMLDivElement>(null);
  const children = immediateChildFolders(folders, browse);
  const [focusIndex, setFocusIndex] = useState(-1);
  const browseKey = browse.type === "folder" ? `folder:${browse.id}` : browse.type;
  const destination = destinationDisplayPath(libraryName, folders, browse);

  useEffect(() => {
    setFocusIndex(-1);
    if (isTypingTarget(document.activeElement)) return;
    listRef.current?.focus();
  }, [browseKey]);

  useEffect(() => {
    if (focusIndex < 0) return;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-index="${focusIndex}"]`);
    row?.scrollIntoView?.({ block: "nearest" });
  }, [focusIndex]);

  const stepInto = (folderId: number) => {
    onBrowseChange({ type: "folder", id: folderId });
  };

  const stepUp = () => {
    const parent = pickerParentPlace(folders, browse);
    if (parent) onBrowseChange(parent);
  };

  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") event.preventDefault();
    if (event.key === "Enter") {
      const folderId = pickerActivationFolderId({
        targetFolderId: folderIdFromTarget(event.target),
        focusIndex,
        children,
      });
      if (folderId == null) return;
      event.preventDefault();
      stepInto(folderId);
      return;
    }
    const action = pickerListKeyAction({
      key: event.key,
      focusIndex,
      childCount: children.length,
      children,
    });
    if (action?.type !== "focus") return;
    event.preventDefault();
    setFocusIndex(action.index);
  };

  const activeId = focusIndex >= 0 && children[focusIndex] ? `${listId}-folder-${children[focusIndex].id}` : undefined;

  return (
    <div className="folder-picker">
      <div className="folder-picker-toolbar">
        <Breadcrumb
          libraryName={libraryName}
          folders={folders}
          browse={browse}
          onNavigate={onBrowseChange}
          fullPath
        />
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
      <p className="folder-picker-destination" aria-live="polite" title={destination}>
        Copy into: {destination}
      </p>
      <div
        id={listId}
        ref={listRef}
        className="folder-picker-list"
        role="listbox"
        aria-label="Destination folder"
        aria-activedescendant={activeId}
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
                id={`${listId}-folder-${folder.id}`}
                data-folder-id={folder.id}
                data-index={index}
                className={`folder-picker-row${focused ? " focused" : ""}`}
                role="option"
                aria-selected={focused}
                title={folder.name}
                onClick={() => stepInto(folder.id)}
              >
                <span className="tree-twist" aria-hidden>
                  <span className="tree-twist-icon" />
                </span>
                <FolderIcon size={16} />
                <span className="folder-picker-name">{folder.name}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
