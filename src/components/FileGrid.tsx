import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { convertFileSrc } from "@tauri-apps/api/core";
import { debugLog } from "../debugLog";
import {
  TILE_CHROME,
  TILE_PX,
  clientToContent,
  contentToClient,
  contentWidth,
  marqueeHitIndices,
  mergeSelection,
  normalizeRect,
  visibleGridWindow,
} from "../lib/gridWindow";
import type { FileRow, GridSize } from "../types";

const MARQUEE_SLOP = 4;
const SCROLL_EDGE = 28;
const SCROLL_MAX = 18;

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

function paddingOf(node: HTMLElement) {
  const style = getComputedStyle(node);
  return {
    left: parseFloat(style.paddingLeft) || 0,
    top: parseFloat(style.paddingTop) || 0,
  };
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
        {file.ext === "pdf" || file.ext === "txt" ? (
          <span className={`type-icon type-icon-${file.ext}`}>{file.ext.toUpperCase()}</span>
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
  gridSize,
  selected,
  previewIconsEnabled,
  scrollRootRef,
  onSelect,
  onSelectionChange,
  onOpen,
  onContextMenu,
}: {
  files: FileRow[];
  gridSize: GridSize;
  selected: number[];
  previewIconsEnabled: boolean;
  scrollRootRef: React.RefObject<HTMLElement | null>;
  onSelect: (id: number, mode: "replace" | "toggle" | "range") => void;
  onSelectionChange: (ids: number[]) => void;
  onOpen?: (file: FileRow) => void;
  onContextMenu?: (event: React.MouseEvent, file: FileRow) => void;
}) {
  const [scrollRoot, setScrollRoot] = useState<HTMLElement | null>(null);
  const [frame, setFrame] = useState({ width: 0, height: 0, scrollTop: 0 });
  const [band, setBand] = useState<MarqueeBand | null>(null);
  const filesRef = useRef(files);
  const selectedRef = useRef(selected);
  const widthRef = useRef(frame.width);
  const tileRef = useRef(TILE_PX[gridSize]);
  const onSelectionChangeRef = useRef(onSelectionChange);
  filesRef.current = files;
  selectedRef.current = selected;
  widthRef.current = frame.width;
  tileRef.current = TILE_PX[gridSize];
  onSelectionChangeRef.current = onSelectionChange;

  useEffect(() => {
    setScrollRoot(scrollRootRef.current);
  }, [scrollRootRef, files.length]);

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
  }, [scrollRootRef, files.length, gridSize]);

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
      const indices = marqueeHitIndices({
        count: filesRef.current.length,
        width: widthRef.current,
        tile: tileRef.current,
        rect,
      });
      const hits = indices.map((index) => filesRef.current[index]?.id).filter((id): id is number => id != null);
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
      if (target.closest("[data-file-id]")) return;
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
  }, [scrollRootRef, files.length]);

  const tile = TILE_PX[gridSize];
  const page = files.length === 0 ? null : visibleGridWindow({ count: files.length, tile, ...frame });
  const visible = page ? files.slice(page.start, page.end) : [];
  return (
    <>
      {files.length === 0 || !page ? (
        <div className="empty">This folder is empty. Drop files here to import them.</div>
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
                  key={file.id}
                  type="button"
                  className={`tile${selected.includes(file.id) ? " selected" : ""}`}
                  data-file-id={file.id}
                  title={title}
                  draggable={false}
                  onDragStart={(event) => event.preventDefault()}
                  onClick={(event) => {
                    const mode = event.shiftKey ? "range" : event.ctrlKey || event.metaKey ? "toggle" : "replace";
                    onSelect(file.id, mode);
                  }}
                  onDoubleClick={(event) => {
                    event.preventDefault();
                    onOpen?.(file);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    onContextMenu?.(event, file);
                  }}
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
      )}
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
