import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { debugLog } from "../debugLog";
import { TILE_PX, visibleGridWindow } from "../lib/gridWindow";
import type { FileRow, GridSize } from "../types";

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
        <span className="type-icon">{file.ext.toUpperCase()}</span>
      </div>
    );
  }
  const src = convertFileSrc(file.thumbPath);
  return (
    <div className="thumb" ref={tileRef}>
      <img
        src={src}
        alt=""
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
  onContextMenu,
}: {
  files: FileRow[];
  gridSize: GridSize;
  selected: number[];
  previewIconsEnabled: boolean;
  scrollRootRef: React.RefObject<HTMLElement | null>;
  onSelect: (id: number, mode: "replace" | "toggle" | "range") => void;
  onContextMenu?: (event: React.MouseEvent, file: FileRow) => void;
}) {
  const [scrollRoot, setScrollRoot] = useState<HTMLElement | null>(null);
  const [frame, setFrame] = useState({ width: 0, height: 0, scrollTop: 0 });

  useEffect(() => {
    setScrollRoot(scrollRootRef.current);
  }, [scrollRootRef, files.length]);

  useEffect(() => {
    const node = scrollRootRef.current;
    if (!node) return;
    const update = () => {
      setFrame({ width: node.clientWidth, height: node.clientHeight, scrollTop: node.scrollTop });
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

  if (files.length === 0) {
    return <div className="empty">This folder is empty. Drop files here to import them.</div>;
  }
  const tile = TILE_PX[gridSize];
  const page = visibleGridWindow({ count: files.length, tile, ...frame });
  const visible = files.slice(page.start, page.end);
  return (
    <div className="grid-virtual" style={{ height: page.totalHeight }}>
      <div className={`grid ${gridSize}`} style={{ top: page.padTop }}>
        {visible.map((file) => {
        const title = [file.sortName, file.creator, file.tags.join(", ")].filter(Boolean).join(" · ");
        return (
          <button
            key={file.id}
            type="button"
            className={`tile${selected.includes(file.id) ? " selected" : ""}`}
            data-file-id={file.id}
            title={title}
            onClick={(event) => {
              const mode = event.shiftKey ? "range" : event.ctrlKey || event.metaKey ? "toggle" : "replace";
              onSelect(file.id, mode);
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
  );
}
