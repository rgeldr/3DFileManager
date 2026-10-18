import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { api } from "../api";
import { usePreviewSplitter } from "../hooks/usePreviewSplitter";
import type { FileRow, FolderRow } from "../types";
import { Viewer } from "./Viewer";

function PinIcon({ pinned }: { pinned: boolean }) {
  return (
    <svg
      className="inspector-pin-icon"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill={pinned ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
        d="M8 1.5 10.2 5.2h2.3l-1.7 1.7 1.5 4.1L8 9.3l-4.3 1.7 1.5-4.1L3.5 5.2h2.3L8 1.5z"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        d="M8 9.5v5"
      />
    </svg>
  );
}

export function Inspector({
  file,
  folders,
  creators,
  knownTags,
  onSave,
  onDelete,
  previewHeight,
  onPreviewHeight,
  pinned,
  onPinnedChange,
}: {
  file: FileRow | null;
  folders: FolderRow[];
  creators: string[];
  knownTags: string[];
  onSave: (file: FileRow, tags: string[]) => void;
  onDelete: (id: number) => void;
  previewHeight: number;
  onPreviewHeight: (height: number) => void;
  pinned: boolean;
  onPinnedChange: (pinned: boolean) => void;
}) {
  const [sortName, setSortName] = useState("");
  const [creator, setCreator] = useState("");
  const [notes, setNotes] = useState("");
  const [folderId, setFolderId] = useState<string>("root");
  const [tagText, setTagText] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const split = usePreviewSplitter(previewHeight, onPreviewHeight);
  const previewStyle = { "--preview-height": `${split.displayed}px` } as CSSProperties;

  useEffect(() => {
    if (!file) return;
    setSortName(file.sortName);
    setCreator(file.creator);
    setNotes(file.notes);
    setFolderId(file.folderId == null ? "root" : String(file.folderId));
    setTags(file.tags);
    setTagText("");
  }, [file]);

  const commitPendingTag = (current: string[], pending: string) => {
    const next = pending.trim();
    if (!next || current.some((tag) => tag.toLowerCase() === next.toLowerCase())) {
      return current;
    }
    return [...current, next];
  };

  const pinButton = (
    <button
      type="button"
      className="inspector-pin"
      aria-pressed={pinned}
      aria-label={pinned ? "Unpin details" : "Pin details open"}
      title={pinned ? "Unpin details" : "Pin details open"}
      onClick={() => onPinnedChange(!pinned)}
    >
      <PinIcon pinned={pinned} />
    </button>
  );

  if (!pinned) {
    return (
      <aside className="inspector collapsed" data-pinned="false">
        <div className="inspector-head">{pinButton}</div>
      </aside>
    );
  }

  if (!file) {
    return (
      <aside ref={split.paneRef} className="inspector" data-pinned="true">
        <div className="inspector-head">{pinButton}</div>
        <div className="empty inspector-body">Select a file to edit its details and preview.</div>
      </aside>
    );
  }

  return (
    <aside ref={split.paneRef} className="inspector" style={previewStyle} data-pinned="true">
      <div className="inspector-head">{pinButton}</div>
      <Viewer file={file} />
      <div
        className="preview-splitter"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize preview"
        aria-valuemin={split.bounds.min}
        aria-valuemax={split.bounds.max}
        aria-valuenow={split.displayed}
        tabIndex={0}
        onPointerDown={split.onPointerDown}
        onKeyDown={split.onKeyDown}
        onDoubleClick={split.onDoubleClick}
      />
      <form
        className="inspector-body"
        onSubmit={(event) => {
          event.preventDefault();
          const nextTags = commitPendingTag(tags, tagText);
          setTags(nextTags);
          setTagText("");
          onSave(
            {
              ...file,
              sortName,
              creator,
              notes,
              folderId: folderId === "root" ? null : Number(folderId),
            },
            nextTags,
          );
        }}
      >
        <label>
          Sort name
          <input value={sortName} onChange={(event) => setSortName(event.target.value)} />
        </label>
        <label>
          Creator
          <input
            list="creators"
            value={creator}
            onChange={(event) => setCreator(event.target.value)}
          />
          <datalist id="creators">
            {creators.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
        </label>
        <label>
          Folder
          <select value={folderId} onChange={(event) => setFolderId(event.target.value)}>
            <option value="root">Library root</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.relpath}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tags
          <div className="tags">
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                className="tag"
                onClick={() => setTags(tags.filter((item) => item !== tag))}
              >
                {tag} ×
              </button>
            ))}
          </div>
          <input
            list="tags"
            value={tagText}
            placeholder="Add a tag"
            onChange={(event) => setTagText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                setTags(commitPendingTag(tags, tagText));
                setTagText("");
              }
            }}
          />
          <datalist id="tags">
            {knownTags.map((tag) => (
              <option key={tag} value={tag} />
            ))}
          </datalist>
        </label>
        <label>
          Notes
          <textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        <p className="muted">File name: {file.originalName}</p>
        {file.sourceArchive ? <p className="muted">From archive: {file.sourceArchive}</p> : null}
        <div className="row">
          <button type="submit" className="primary">Save</button>
          <button type="button" onClick={() => void api.openInDefaultApp(file.id)}>Open</button>
          <button type="button" onClick={() => void api.revealFile(file.id)}>
            Show in Explorer
          </button>
          <button type="button" onClick={() => onDelete(file.id)}>Delete</button>
        </div>
      </form>
    </aside>
  );
}
