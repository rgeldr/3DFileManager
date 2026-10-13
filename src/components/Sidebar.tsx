import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FolderRow } from "../types";

const ROOT_KEY = "root";

function folderKey(id: number) {
  return `folder:${id}`;
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
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([ROOT_KEY]));
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastClickRef = useRef<{ key: string; time: number } | null>(null);

  const childrenOf = useCallback(
    (parentId: number | null) => folders.filter((folder) => folder.parentId === parentId),
    [folders],
  );

  const hasChildren = useCallback(
    (parentId: number | null) => folders.some((folder) => folder.parentId === parentId),
    [folders],
  );

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
    if (!dropTarget || dropTarget === "all") return;
    const key = dropTarget === ROOT_KEY ? ROOT_KEY : folderKey(Number(dropTarget));
    const parentId = dropTarget === ROOT_KEY ? null : Number(dropTarget);
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
  }, [dropTarget, hasChildren]);

  const visibleRowKeys = useMemo(() => {
    const keys: string[] = ["all", ROOT_KEY];
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

  const renderLevel = (parentId: number | null, depth: number, parentKey: string) =>
    childrenOf(parentId).map((folder) => {
      const key = folderKey(folder.id);
      const kids = hasChildren(folder.id);
      const open = expanded.has(key);
      const browse = key;
      return (
        <div key={folder.id}>
          <div
            className={`folder-row${browseKey === key ? " active" : ""}${dropTarget === String(folder.id) ? " drop" : ""}`}
            style={{ paddingLeft: `${8 + depth * 14}px` }}
            data-folder-id={folder.id}
            data-tree-key={key}
            tabIndex={0}
            onKeyDown={(event) => onTreeKeyDown(event, key, parentKey, kids)}
          >
            {kids ? twist(key, open, folder.name) : twistSpacer()}
            <span
              className="folder-label"
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

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <button type="button" onClick={onNew}>New folder</button>
        <button type="button" onClick={onRename}>Rename</button>
        <button type="button" onClick={onDelete}>Delete</button>
      </div>
      <div className="sidebar-scroll" ref={scrollRef}>
        <div className="section-label">Library</div>
        <div
          className={`tree-item${browseKey === "all" ? " active" : ""}`}
          data-tree-key="all"
          tabIndex={0}
          onClick={() => onBrowse("all")}
          onKeyDown={(event) => onTreeKeyDown(event, "all", null, false)}
        >
          All files
        </div>
        <div
          className={`folder-row${browseKey === ROOT_KEY ? " active" : ""}${dropTarget === ROOT_KEY ? " drop" : ""}`}
          data-folder-id="root"
          data-tree-key={ROOT_KEY}
          tabIndex={0}
          onKeyDown={(event) => onTreeKeyDown(event, ROOT_KEY, null, rootKids)}
        >
          {rootKids ? twist(ROOT_KEY, expanded.has(ROOT_KEY), libraryName) : twistSpacer()}
          <span
            className="folder-label"
            onClick={() => onFolderLabelClick(ROOT_KEY, ROOT_KEY, rootKids)}
          >
            {libraryName}
          </span>
        </div>
        {expanded.has(ROOT_KEY) ? renderLevel(null, 1, ROOT_KEY) : null}
      </div>
    </aside>
  );
}
