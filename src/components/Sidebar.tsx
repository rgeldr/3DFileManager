import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FolderRow } from "../types";
import { FolderContextMenu } from "./dialogs/FolderContextMenu";
import { FolderIcon } from "./FileGridRows";
import { PinIcon } from "./Inspector";

type FolderContextMenu = { x: number; y: number; folderId: number | null };

const ROOT_KEY = "root";
const DRAG_THRESHOLD_PX = 5;

export function folderKey(id: number) {
  return `folder:${id}`;
}

export function isFolderUnderAncestor(folders: FolderRow[], ancestorId: number, folderId: number | null): boolean {
  let current = folderId;
  while (current != null) {
    if (current === ancestorId) return true;
    current = folders.find((f) => f.id === current)?.parentId ?? null;
  }
  return false;
}

export function Sidebar({
  folders,
  libraryName,
  browseKey,
  dropTarget,
  expandHint,
  onBrowse,
  onNew,
  onRename,
  onDelete,
  onNewInFolder,
  onRenameFolder,
  onDeleteFolder,
  onTagFolder,
  onSetCreator,
  onReveal,
  onRescan,
  onMoveFolder,
  pinned,
  onPinnedChange,
}: {
  folders: FolderRow[];
  libraryName: string;
  browseKey: string;
  dropTarget: string | null;
  expandHint: { key: string; nonce: number } | null;
  onBrowse: (key: string) => void;
  onNew: () => void;
  onRename: () => void;
  onDelete: () => void;
  onNewInFolder: (parentId: number | null) => void;
  onRenameFolder: (folderId: number) => void;
  onDeleteFolder: (folderId: number) => void;
  onTagFolder: (folderId: number | null) => void;
  onSetCreator: (folderId: number | null) => void;
  onReveal: (folderId: number | null) => void;
  onRescan: (folderId: number | null) => void;
  onMoveFolder: (id: number, parentId: number | null) => void;
  pinned: boolean;
  onPinnedChange: (pinned: boolean) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([ROOT_KEY]));
  const [contextMenu, setContextMenu] = useState<FolderContextMenu | null>(null);
  const [folderDropTarget, setFolderDropTarget] = useState<string | null>(null);
  const [folderDragging, setFolderDragging] = useState(false);
  const [draggingFolderId, setDraggingFolderId] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastClickRef = useRef<{ key: string; time: number } | null>(null);
  const folderDragRef = useRef<{
    folderId: number;
    startX: number;
    startY: number;
    active: boolean;
  } | null>(null);

  const childrenOf = useCallback(
    (parentId: number | null) => folders.filter((folder) => folder.parentId === parentId),
    [folders],
  );

  const hasChildren = useCallback(
    (parentId: number | null) => folders.some((folder) => folder.parentId === parentId),
    [folders],
  );

  const isInvalidFolderDrop = useCallback(
    (dragFolderId: number, target: string | null) => {
      if (!target) return true;
      const dropFolderId = target === ROOT_KEY ? null : Number(target);
      if (dropFolderId === dragFolderId) return true;
      return isFolderUnderAncestor(folders, dragFolderId, dropFolderId);
    },
    [folders],
  );

  const effectiveDropTarget = folderDragging ? folderDropTarget : dropTarget;

  const toggleExpanded = useCallback((key: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!browseKey.startsWith("folder:")) return;
    const id = Number(browseKey.slice(7));
    const ancestors: string[] = [ROOT_KEY];
    let parentId: number | null | undefined = folders.find((f) => f.id === id)?.parentId;
    while (parentId != null) {
      ancestors.push(folderKey(parentId));
      parentId = folders.find((f) => f.id === parentId)?.parentId;
    }
    setExpanded((current) => {
      const next = new Set(current);
      for (const key of ancestors) next.add(key);
      return next;
    });
  }, [browseKey, folders]);

  useEffect(() => {
    if (!expandHint) return;
    setExpanded((current) => {
      const next = new Set(current);
      next.add(expandHint.key);
      if (expandHint.key !== ROOT_KEY && expandHint.key.startsWith("folder:")) {
        next.add(ROOT_KEY);
      }
      return next;
    });
  }, [expandHint?.nonce, expandHint?.key]);

  useEffect(() => {
    if (!effectiveDropTarget) return;
    const key = effectiveDropTarget === ROOT_KEY ? ROOT_KEY : folderKey(Number(effectiveDropTarget));
    const parentId = effectiveDropTarget === ROOT_KEY ? null : Number(effectiveDropTarget);
    if (!hasChildren(parentId)) return;
    const timer = window.setTimeout(() => {
      setExpanded((current) => {
        if (current.has(key)) return current;
        const next = new Set(current);
        next.add(key);
        return next;
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [effectiveDropTarget, hasChildren]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = folderDragRef.current;
      if (!drag) return;
      if (!drag.active) {
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        drag.active = true;
        setFolderDragging(true);
        setDraggingFolderId(drag.folderId);
      }
      const element = document.elementFromPoint(event.clientX, event.clientY);
      const folder = element?.closest("[data-folder-id]")?.getAttribute("data-folder-id") ?? null;
      if (folder && !isInvalidFolderDrop(drag.folderId, folder)) {
        setFolderDropTarget(folder);
      } else {
        setFolderDropTarget(null);
      }
    };
    const onUp = (event: PointerEvent) => {
      const drag = folderDragRef.current;
      folderDragRef.current = null;
      if (!drag) return;
      if (!drag.active) {
        setFolderDragging(false);
        setDraggingFolderId(null);
        setFolderDropTarget(null);
        return;
      }
      const element = document.elementFromPoint(event.clientX, event.clientY);
      const folder = element?.closest("[data-folder-id]")?.getAttribute("data-folder-id") ?? null;
      setFolderDragging(false);
      setDraggingFolderId(null);
      setFolderDropTarget(null);
      if (!folder || isInvalidFolderDrop(drag.folderId, folder)) return;
      const parentId = folder === ROOT_KEY ? null : Number(folder);
      onMoveFolder(drag.folderId, parentId);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [isInvalidFolderDrop, onMoveFolder]);

  const openFolderContextMenu = (
    event: React.MouseEvent,
    browse: string,
    folderId: number | null,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    onBrowse(browse);
    setContextMenu({ x: event.clientX, y: event.clientY, folderId });
  };

  const onFolderRowPointerDown = (event: React.PointerEvent, folderId: number) => {
    if (event.button !== 0) return;
    if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus();
    if ((event.target as HTMLElement).closest(".tree-twist")) return;
    folderDragRef.current = {
      folderId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
    };
  };

  const visibleRowKeys = useMemo(() => {
    const keys: string[] = [ROOT_KEY];
    const walk = (parentId: number | null) => {
      for (const folder of childrenOf(parentId)) {
        const key = folderKey(folder.id);
        keys.push(key);
        if (expanded.has(key)) walk(folder.id);
      }
    };
    if (expanded.has(ROOT_KEY)) walk(null);
    return keys;
  }, [childrenOf, expanded]);

  const focusRow = (key: string) => {
    scrollRef.current?.querySelector<HTMLElement>(`[data-tree-key="${key}"]`)?.focus();
  };

  const onFolderLabelClick = (key: string, browse: string, hasKids: boolean) => {
    const now = Date.now();
    const last = lastClickRef.current;
    if (last && last.key === key && now - last.time < 400) {
      lastClickRef.current = null;
      onBrowse(browse);
      if (hasKids) toggleExpanded(key);
      return;
    }
    lastClickRef.current = { key, time: now };
    onBrowse(browse);
  };

  const onTreeKeyDown = (event: React.KeyboardEvent, key: string, parentKey: string | null, hasKids: boolean) => {
    const index = visibleRowKeys.indexOf(key);
    if (index < 0) return;
    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        if (index < visibleRowKeys.length - 1) focusRow(visibleRowKeys[index + 1]);
        break;
      }
      case "ArrowUp": {
        event.preventDefault();
        if (index > 0) focusRow(visibleRowKeys[index - 1]);
        break;
      }
      case "ArrowRight": {
        event.preventDefault();
        if (hasKids && !expanded.has(key)) toggleExpanded(key);
        else if (hasKids && expanded.has(key)) {
          const childIndex = index + 1;
          if (childIndex < visibleRowKeys.length) focusRow(visibleRowKeys[childIndex]);
        }
        break;
      }
      case "ArrowLeft": {
        event.preventDefault();
        if (hasKids && expanded.has(key)) toggleExpanded(key);
        else if (parentKey) focusRow(parentKey);
        break;
      }
      default:
        break;
    }
  };

  const twist = (key: string, open: boolean, label: string) => (
    <button
      type="button"
      className="tree-twist"
      aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
      aria-expanded={open}
      onClick={(event) => {
        event.stopPropagation();
        toggleExpanded(key);
      }}
    >
      <span className={`tree-twist-icon${open ? " open" : ""}`} aria-hidden />
    </button>
  );

  const twistSpacer = () => <span className="tree-twist-spacer" aria-hidden />;

  const dropClass = (targetId: string) =>
    effectiveDropTarget === targetId ? " drop" : "";

  const renderLevel = (parentId: number | null, depth: number, parentKey: string) =>
    childrenOf(parentId).map((folder) => {
      const key = folderKey(folder.id);
      const kids = hasChildren(folder.id);
      const open = expanded.has(key);
      const browse = key;
      const dragging = draggingFolderId === folder.id;
      return (
        <div key={folder.id}>
          <div
            className={`folder-row${browseKey === key ? " active" : ""}${dropClass(String(folder.id))}${dragging ? " dragging" : ""}`}
            style={{ paddingLeft: `${8 + depth * 14}px` }}
            data-folder-id={folder.id}
            data-tree-key={key}
            tabIndex={0}
            onPointerDown={(event) => onFolderRowPointerDown(event, folder.id)}
            onKeyDown={(event) => onTreeKeyDown(event, key, parentKey, kids)}
            onContextMenu={(event) => openFolderContextMenu(event, browse, folder.id)}
          >
            {kids ? twist(key, open, folder.name) : twistSpacer()}
            <FolderIcon size={16} />
            <span
              className="folder-label"
              title={folder.name}
              onClick={() => onFolderLabelClick(key, browse, kids)}
            >
              {folder.name}
            </span>
          </div>
          {open ? renderLevel(folder.id, depth + 1, key) : null}
        </div>
      );
    });

  const rootKids = hasChildren(null);

  const pinButton = (
    <button
      type="button"
      className="inspector-pin"
      aria-pressed={pinned}
      aria-label={pinned ? "Unpin folders" : "Pin folders open"}
      title={pinned ? "Unpin folders" : "Pin folders open"}
      onClick={() => onPinnedChange(!pinned)}
    >
      <PinIcon pinned={pinned} />
    </button>
  );

  if (!pinned) {
    return (
      <aside className="sidebar collapsed" data-pinned="false">
        <div className="sidebar-head">{pinButton}</div>
      </aside>
    );
  }

  return (
    <aside className={`sidebar${folderDragging ? " folder-dragging" : ""}`} data-pinned="true">
      <div className="sidebar-head">
        <button type="button" onClick={onNew}>New folder</button>
        <button type="button" onClick={onRename}>Rename</button>
        <button type="button" onClick={onDelete}>Delete</button>
        {pinButton}
      </div>
      <div className="sidebar-scroll" ref={scrollRef}>
        <div className="section-label">Library</div>
        <div
          className={`folder-row${browseKey === ROOT_KEY ? " active" : ""}${dropClass(ROOT_KEY)}`}
          data-folder-id="root"
          data-tree-key={ROOT_KEY}
          tabIndex={0}
          onPointerDown={(event) => {
            if (event.button === 0 && event.currentTarget instanceof HTMLElement) event.currentTarget.focus();
          }}
          onKeyDown={(event) => onTreeKeyDown(event, ROOT_KEY, null, rootKids)}
          onContextMenu={(event) => openFolderContextMenu(event, ROOT_KEY, null)}
        >
          {rootKids ? twist(ROOT_KEY, expanded.has(ROOT_KEY), libraryName) : twistSpacer()}
          <FolderIcon size={16} />
          <span
            className="folder-label"
            title={libraryName}
            onClick={() => onFolderLabelClick(ROOT_KEY, ROOT_KEY, rootKids)}
          >
            {libraryName}
          </span>
        </div>
        {expanded.has(ROOT_KEY) ? renderLevel(null, 1, ROOT_KEY) : null}
      </div>
      <FolderContextMenu
        menu={contextMenu}
        onClose={() => setContextMenu(null)}
        onNewInFolder={onNewInFolder}
        onRenameFolder={onRenameFolder}
        onDeleteFolder={onDeleteFolder}
        onTagFolder={onTagFolder}
        onSetCreator={onSetCreator}
        onReveal={onReveal}
        onRescan={onRescan}
      />
    </aside>
  );
}
