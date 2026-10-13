import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { FileRow, GridSize } from "../types";

function LazyThumb({
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

  useEffect(() => {
    if (!previewIconsEnabled || !file.thumbPath || showImage) return;
    const node = tileRef.current;
    if (!node || !scrollRoot) return;
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
  }, [previewIconsEnabled, file.thumbPath, showImage, scrollRoot]);

  if (!previewIconsEnabled || !file.thumbPath || !showImage) {
    return (
      <div className="thumb" ref={tileRef}>
        <span className="type-icon">{file.ext.toUpperCase()}</span>
      </div>
    );
  }
  return (
    <div className="thumb" ref={tileRef}>
      <img src={convertFileSrc(file.thumbPath)} alt="" />
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
}: {
  files: FileRow[];
  gridSize: GridSize;
  selected: number[];
  previewIconsEnabled: boolean;
  scrollRootRef: React.RefObject<HTMLElement | null>;
  onSelect: (id: number, mode: "replace" | "toggle" | "range") => void;
}) {
  const [scrollRoot, setScrollRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setScrollRoot(scrollRootRef.current);
  }, [scrollRootRef, files.length]);

  if (files.length === 0) {
    return <div className="empty">This folder is empty. Drop files here to import them.</div>;
  }
  return (
    <div className={`grid ${gridSize}`}>
      {files.map((file) => {
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
  );
}
