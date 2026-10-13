import type { FolderRow } from "../types";

export function Sidebar({
  folders,
  libraryName,
  browseKey,
  dropTarget,
  onBrowse,
  onNew,
  onRename,
  onDelete,
}: {
  folders: FolderRow[];
  libraryName: string;
  browseKey: string;
  dropTarget: string | null;
  onBrowse: (key: string) => void;
  onNew: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const childrenOf = (parentId: number | null) =>
    folders.filter((folder) => folder.parentId === parentId);

  const renderLevel = (parentId: number | null, depth: number) =>
    childrenOf(parentId).map((folder) => (
      <div key={folder.id}>
        <div
          className={`folder-row${browseKey === `folder:${folder.id}` ? " active" : ""}${dropTarget === String(folder.id) ? " drop" : ""}`}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          data-folder-id={folder.id}
          onClick={() => onBrowse(`folder:${folder.id}`)}
        >
          <span>{folder.name}</span>
        </div>
        {renderLevel(folder.id, depth + 1)}
      </div>
    ));

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <button type="button" onClick={onNew}>New folder</button>
        <button type="button" onClick={onRename}>Rename</button>
        <button type="button" onClick={onDelete}>Delete</button>
      </div>
      <div className="sidebar-scroll">
        <div className="section-label">Library</div>
        <div
          className={`tree-item${browseKey === "all" ? " active" : ""}`}
          onClick={() => onBrowse("all")}
        >
          All files
        </div>
        <div
          className={`folder-row${browseKey === "root" ? " active" : ""}${dropTarget === "root" ? " drop" : ""}`}
          data-folder-id="root"
          onClick={() => onBrowse("root")}
        >
          {libraryName}
        </div>
        {renderLevel(null, 1)}
      </div>
    </aside>
  );
}
