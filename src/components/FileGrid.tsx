import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { convertFileSrc } from "@tauri-apps/api/core";
import { debugLog } from "../debugLog";
import {
  DETAILS_HEADER_PX,
  ROW_PX,
  TILE_CHROME,
  TILE_PX,
  clientToContent,
  contentToClient,
  contentWidth,
  marqueeHitIndices,
  mergeSelection,
  normalizeRect,
  rowHitIndices,
  visibleGridWindow,
  visibleRowWindow,
} from "../lib/gridWindow";
import type { FileRow, FolderRow, GridSize, LibrarySort, SortField, ViewMode } from "../types";
import {
  DetailsFolderRow,
  DetailsHeader,
  DetailsRow,
  FolderIcon,
  ListRow,
  fileDisplayName,
} from "./FileGridRows";

const MARQUEE_SLOP = 4;
const SCROLL_EDGE = 28;
const SCROLL_MAX = 18;

type GridItem =
  | { kind: "folder"; folder: FolderRow }
  | { kind: "file"; file: FileRow };

type MarqueeDrag = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startContentX: number;
  startContentY: number;
  clientX: number;
  clientY: number;
  additive: boolean;
  base: number[];
  latest: number[];
  moved: boolean;
};

type MarqueeBand = { left: number; top: number; width: number; height: number };

function isGridSize(view: ViewMode): view is GridSize {
  return view !== "list" && view !== "details";
}

function paddingOf(node: HTMLElement) {
  const style = getComputedStyle(node);
  return {
    left: parseFloat(style.paddingLeft) || 0,
    top: parseFloat(style.paddingTop) || 0,
  };
}

function fileIdAt(items: GridItem[], index: number): number | null {
  const item = items[index];
  return item?.kind === "file" ? item.file.id : null;
}

export function LazyThumb({
  file,
  previewIconsEnabled,
  scrollRoot,
}: {
  file: FileRow;
  previewIconsEnabled: boolean;
  scrollRoot: HTMLElement | null;
}) {
  const tileRef = useRef<HTMLDivElement>(null);
  const [showImage, setShowImage] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!previewIconsEnabled || !file.thumbPath || showImage || failed) return;
    const node = tileRef.current;
    if (!node) return;
    if (!scrollRoot) {
      if (node.getBoundingClientRect().top < window.innerHeight + 200) {
        setShowImage(true);
      }
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShowImage(true);
          observer.disconnect();
        }
      },
      { root: scrollRoot, rootMargin: "200px", threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [previewIconsEnabled, file.thumbPath, showImage, scrollRoot, failed]);

  if (!previewIconsEnabled || !file.thumbPath || !showImage || failed) {
    return (
      <div className="thumb" ref={tileRef}>
        {file.ext === "pdf" || file.ext === "txt" || file.ext === "md" || file.ext === "scad" ? (
          <span
            className={`type-icon type-icon-${file.ext === "pdf" ? "pdf" : "txt"}`}
          >
            {file.ext.toUpperCase()}
          </span>
        ) : (
          <span className="type-icon">{file.ext.toUpperCase()}</span>
        )}
      </div>
    );
  }
  const src = convertFileSrc(file.thumbPath);
  return (
    <div className="thumb" ref={tileRef}>
      <img
        src={src}
        alt=""
        draggable={false}
        onDragStart={(event) => event.preventDefault()}
        onError={() => {
          debugLog("thumb-img-error", { id: file.id, src });
          setFailed(true);
        }}
      />
    </div>
  );
}

export function FileGrid({
  files,
  folders,
  emptyMessage = "This folder is empty. Drop files here to import them.",
  view,
  sort,
  onClearFilters,
  gridSize,
  selected,
  previewIconsEnabled,
  scrollRootRef,
  onSelect,
  onSelectionChange,
  onOpen,
  onOpenFolder,
  onSort,
  onContextMenu,
}: {
  files: FileRow[];
  folders: FolderRow[];
  emptyMessage?: string;
  view: ViewMode;
  sort: LibrarySort;
  onClearFilters?: () => void;
  gridSize: GridSize;
  selected: number[];
  previewIconsEnabled: boolean;
  scrollRootRef: React.RefObject<HTMLElement | null>;
  onSelect: (id: number, mode: "replace" | "toggle" | "range") => void;
  onSelectionChange: (ids: number[]) => void;
  onOpen?: (file: FileRow) => void;
  onOpenFolder?: (id: number) => void;
  onSort?: (field: SortField) => void;
  onContextMenu?: (event: React.MouseEvent, file: FileRow) => void;
}) {
  const [scrollRoot, setScrollRoot] = useState<HTMLElement | null>(null);
  const [frame, setFrame] = useState({ width: 0, height: 0, scrollTop: 0 });
  const [band, setBand] = useState<MarqueeBand | null>(null);
  const items = useMemo<GridItem[]>(
    () => [...folders.map((folder) => ({ kind: "folder" as const, folder })), ...files.map((file) => ({ kind: "file" as const, file }))],
    [folders, files],
  );
  const itemsRef = useRef(items);
  const selectedRef = useRef(selected);
  const widthRef = useRef(frame.width);
  const viewRef = useRef(view);
  const tileRef = useRef(isGridSize(view) ? TILE_PX[view] : ROW_PX);
  const onSelectionChangeRef = useRef(onSelectionChange);
  itemsRef.current = items;
  selectedRef.current = selected;
  widthRef.current = frame.width;
  viewRef.current = view;
  tileRef.current = isGridSize(view) ? TILE_PX[view] : ROW_PX;
  onSelectionChangeRef.current = onSelectionChange;

  useEffect(() => {
    setScrollRoot(scrollRootRef.current);
  }, [scrollRootRef, items.length]);

  useEffect(() => {
    const node = scrollRootRef.current;
    if (!node) return;
    try {
      node.scrollTop = 0;
    } catch {
      // Some test doubles expose scrollTop as read-only.
    }
  }, [view, scrollRootRef]);

  useLayoutEffect(() => {
    const node = scrollRootRef.current;
    if (!node) return;
    const update = () => {
      const style = getComputedStyle(node);
      const paddingX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
      setFrame({
        width: contentWidth(node.clientWidth, paddingX),
        height: node.clientHeight,
        scrollTop: node.scrollTop,
      });
    };
    update();
    node.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => {
      node.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [scrollRootRef, items.length, view]);

  useEffect(() => {
    const root = scrollRootRef.current;
    if (!root) return;
    const dragRef = { current: null as MarqueeDrag | null };
    let raf = 0;

    const apply = (drag: MarqueeDrag) => {
      const point = (() => {
        const bounds = root.getBoundingClientRect();
        const pad = paddingOf(root);
        return {
          x: clientToContent(drag.clientX, bounds.left, root.scrollLeft, pad.left),
          y: clientToContent(drag.clientY, bounds.top, root.scrollTop, pad.top),
          bounds,
          pad,
        };
      })();
      const moved = Math.hypot(drag.clientX - drag.startClientX, drag.clientY - drag.startClientY) >= MARQUEE_SLOP;
      drag.moved = drag.moved || moved;
      if (!drag.moved) {
        setBand(null);
        return;
      }
      const rect = normalizeRect(drag.startContentX, drag.startContentY, point.x, point.y);
      const currentView = viewRef.current;
      const indices = isGridSize(currentView)
        ? marqueeHitIndices({
            count: itemsRef.current.length,
            width: widthRef.current,
            tile: tileRef.current,
            rect,
          })
        : rowHitIndices({
            count: itemsRef.current.length,
            rect,
            rowOffset: currentView === "details" ? DETAILS_HEADER_PX : 0,
          });
      const hits = indices
        .map((index) => fileIdAt(itemsRef.current, index))
        .filter((id): id is number => id != null);
      const next = mergeSelection(drag.base, hits, drag.additive);
      const same = drag.latest.length === next.length && drag.latest.every((id, index) => id === next[index]);
      if (!same) {
        drag.latest = next;
        onSelectionChangeRef.current(next);
      }
      const x1 = contentToClient(drag.startContentX, point.bounds.left, root.scrollLeft, point.pad.left);
      const y1 = contentToClient(drag.startContentY, point.bounds.top, root.scrollTop, point.pad.top);
      setBand({
        left: Math.min(x1, drag.clientX),
        top: Math.min(y1, drag.clientY),
        width: Math.abs(drag.clientX - x1),
        height: Math.abs(drag.clientY - y1),
      });
    };

    const tick = () => {
      const drag = dragRef.current;
      if (!drag) return;
      const bounds = root.getBoundingClientRect();
      const topDist = drag.clientY - bounds.top;
      const bottomDist = bounds.bottom - drag.clientY;
      let dy = 0;
      if (drag.moved && topDist < SCROLL_EDGE) dy = -Math.ceil(((SCROLL_EDGE - topDist) / SCROLL_EDGE) * SCROLL_MAX);
      else if (drag.moved && bottomDist < SCROLL_EDGE) dy = Math.ceil(((SCROLL_EDGE - bottomDist) / SCROLL_EDGE) * SCROLL_MAX);
      if (dy !== 0) root.scrollTop += dy;
      apply(drag);
      raf = window.requestAnimationFrame(tick);
    };

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const target = event.target;
      if (!(target instanceof Element) || !root.contains(target)) return;
      if (target.closest("[data-file-id], [data-folder-id], [data-sort-header]")) return;
      const bounds = root.getBoundingClientRect();
      const clientRight = bounds.left + root.clientLeft + root.clientWidth;
      const clientBottom = bounds.top + root.clientTop + root.clientHeight;
      if (event.clientX >= clientRight || event.clientY >= clientBottom) return;
      event.preventDefault();
      root.focus();
      const pad = paddingOf(root);
      dragRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startContentX: clientToContent(event.clientX, bounds.left, root.scrollLeft, pad.left),
        startContentY: clientToContent(event.clientY, bounds.top, root.scrollTop, pad.top),
        clientX: event.clientX,
        clientY: event.clientY,
        additive: event.ctrlKey || event.metaKey,
        base: selectedRef.current.slice(),
        latest: selectedRef.current.slice(),
        moved: false,
      };
      try {
        root.setPointerCapture(event.pointerId);
      } catch {
        // The pointer can already be gone in tests.
      }
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(tick);
    };
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag.clientX = event.clientX;
      drag.clientY = event.clientY;
    };
    const finish = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      dragRef.current = null;
      window.cancelAnimationFrame(raf);
      setBand(null);
      if (root.hasPointerCapture(event.pointerId)) root.releasePointerCapture(event.pointerId);
      if (!drag.moved && !drag.additive) onSelectionChangeRef.current([]);
    };
    root.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.cancelAnimationFrame(raf);
      root.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [scrollRootRef, items.length, view]);

  const fileHandlers = (file: FileRow) => ({
    onClick: (event: React.MouseEvent) => {
      const mode = event.shiftKey ? "range" : event.ctrlKey || event.metaKey ? "toggle" : "replace";
      onSelect(file.id, mode);
    },
    onDoubleClick: (event: React.MouseEvent) => {
      event.preventDefault();
      onOpen?.(file);
    },
    onContextMenu: (event: React.MouseEvent) => {
      event.preventDefault();
      onContextMenu?.(event, file);
    },
  });

  const folderDoubleClick = (id: number) => (event: React.MouseEvent) => {
    event.preventDefault();
    onOpenFolder?.(id);
  };

  if (items.length === 0) {
    return <div className="empty">{emptyMessage}</div>;
  }

  if (view === "list") {
    const page = visibleRowWindow({ count: items.length, ...frame });
    const visible = items.slice(page.start, page.end);
    return (
      <>
        <div className="row-virtual" style={{ height: page.totalHeight }}>
          <div className="file-rows list-rows" style={{ top: page.padTop }}>
            {visible.map((item) => {
              if (item.kind === "folder") {
                return (
                  <ListRow
                    key={`folder-${item.folder.id}`}
                    label={item.folder.name}
                    selected={false}
                    isFolder
                    dataFolderId={item.folder.id}
                    onDoubleClick={folderDoubleClick(item.folder.id)}
                  />
                );
              }
              const file = item.file;
              return (
                <ListRow
                  key={file.id}
                  label={fileDisplayName(file)}
                  selected={selected.includes(file.id)}
                  isFolder={false}
                  dataFileId={file.id}
                  {...fileHandlers(file)}
                />
              );
            })}
          </div>
        </div>
        {band ? createPortal(<div className="selection-marquee" style={{ left: band.left, top: band.top, width: band.width, height: band.height }} />, document.body) : null}
      </>
    );
  }

  if (view === "details") {
    const page = visibleRowWindow({ count: items.length, ...frame, rowOffset: DETAILS_HEADER_PX });
    const visible = items.slice(page.start, page.end);
    const bodyTop = page.padTop + DETAILS_HEADER_PX;
    return (
      <>
        <div className="row-virtual details-virtual" style={{ height: page.totalHeight + DETAILS_HEADER_PX }}>
          <DetailsHeader sort={sort} onSort={(field) => onSort?.(field)} />
          <div className="file-rows details-rows" style={{ top: bodyTop }}>
            {visible.map((item) => {
              if (item.kind === "folder") {
                return (
                  <DetailsFolderRow
                    key={`folder-${item.folder.id}`}
                    folder={item.folder}
                    onDoubleClick={folderDoubleClick(item.folder.id)}
                  />
                );
              }
              const file = item.file;
              return (
                <DetailsRow
                  key={file.id}
                  file={file}
                  selected={selected.includes(file.id)}
                  {...fileHandlers(file)}
                />
              );
            })}
          </div>
        </div>
        {band ? createPortal(<div className="selection-marquee" style={{ left: band.left, top: band.top, width: band.width, height: band.height }} />, document.body) : null}
      </>
    );
  }

  const tile = TILE_PX[view];
  const page = visibleGridWindow({ count: items.length, tile, ...frame });
  const visible = items.slice(page.start, page.end);
  return (
    <>
      <div className="grid-virtual" style={{ height: page.totalHeight }}>
        <div
          className={`grid ${view}`}
          style={{ top: page.padTop, ["--grid-row" as string]: `${tile + TILE_CHROME}px` }}
        >
          {visible.map((item) => {
            if (item.kind === "folder") {
              const folder = item.folder;
      {files.length === 0 || !page ? (
        <div className="empty">
          <span>{emptyMessage}</span>
          {onClearFilters ? (
            <button type="button" onClick={onClearFilters}>Clear filters</button>
          ) : null}
        </div>
      ) : (
        <div className="grid-virtual" style={{ height: page.totalHeight }}>
          <div
            className={`grid ${gridSize}`}
            style={{ top: page.padTop, ["--grid-row" as string]: `${tile + TILE_CHROME}px` }}
          >
            {visible.map((file) => {
              const title = [file.sortName, file.creator, file.tags.join(", ")].filter(Boolean).join(" · ");
              return (
                <button
                  key={`folder-${folder.id}`}
                  type="button"
                  className="tile folder-tile"
                  data-folder-id={folder.id}
                  title={folder.name}
                  draggable={false}
                  onDragStart={(event) => event.preventDefault()}
                  onDoubleClick={folderDoubleClick(folder.id)}
                >
                  <div className="thumb">
                    <FolderIcon />
                  </div>
                  <div className="tile-name">{folder.name}</div>
                  <div className="tile-meta">Folder</div>
                </button>
              );
            }
            const file = item.file;
            const title = [file.sortName, file.creator, file.tags.join(", ")].filter(Boolean).join(" · ");
            return (
              <button
                key={file.id}
                type="button"
                className={`tile${selected.includes(file.id) ? " selected" : ""}`}
                data-file-id={file.id}
                title={title}
                draggable={false}
                onDragStart={(event) => event.preventDefault()}
                {...fileHandlers(file)}
              >
                <LazyThumb
                  file={file}
                  previewIconsEnabled={previewIconsEnabled}
                  scrollRoot={scrollRoot}
                />
                <div className="tile-name">{file.sortName}</div>
                <div className="tile-meta">{file.creator || file.ext}</div>
              </button>
            );
          })}
        </div>
      </div>
      {band
        ? createPortal(
            <div
              className="selection-marquee"
              style={{ left: band.left, top: band.top, width: band.width, height: band.height }}
            />,
            document.body,
          )
        : null}
    </>
  );
}
