import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  DEFAULT_PREVIEW_HEIGHT,
  PREVIEW_MAX,
  PREVIEW_MIN,
  clampPreviewHeight,
  dragPreviewHeight,
  nudgePreviewHeight,
  persistPreviewHeight,
  previewHeightBounds,
} from "../lib/previewSplit";

export function usePreviewSplitter(preferred: number, onCommit: (height: number) => void) {
  const [pane, setPane] = useState<HTMLElement | null>(null);
  const [paneHeight, setPaneHeight] = useState(0);
  const paneHeightRef = useRef(0);
  const [live, setLive] = useState<number | null>(null);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  const preferredRef = useRef(preferred);
  preferredRef.current = preferred;

  const paneRef = useCallback((node: HTMLElement | null) => {
    setPane(node);
  }, []);

  useEffect(() => {
    if (!pane || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const next = pane.clientHeight;
      paneHeightRef.current = next;
      setPaneHeight(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(pane);
    return () => observer.disconnect();
  }, [pane]);

  const displayed = paneHeight > 0 ? clampPreviewHeight(live ?? preferred, paneHeight) : (live ?? preferred);
  const bounds = paneHeight > 0 ? previewHeightBounds(paneHeight) : { min: PREVIEW_MIN, max: PREVIEW_MAX };

  const publish = (height: number) => {
    setLive(null);
    if (height !== preferredRef.current) onCommitRef.current(height);
  };

  const commit = (height: number) => {
    publish(persistPreviewHeight(height, paneHeightRef.current));
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.detail >= 2) {
      commit(DEFAULT_PREVIEW_HEIGHT);
      return;
    }
    const handle = event.currentTarget;
    handle.setPointerCapture?.(event.pointerId);
    const startY = event.clientY;
    const paneAtStart = paneHeightRef.current;
    const origin = paneAtStart > 0 ? clampPreviewHeight(preferredRef.current, paneAtStart) : preferredRef.current;
    let moved = false;
    const finish = (ev: PointerEvent) => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", finish);
      if (handle.hasPointerCapture?.(ev.pointerId)) handle.releasePointerCapture(ev.pointerId);
      if (!moved) {
        setLive(null);
        return;
      }
      const paneNow = paneHeightRef.current;
      publish(persistPreviewHeight(dragPreviewHeight(origin, ev.clientY - startY, paneNow), paneNow));
    };
    const move = (ev: PointerEvent) => {
      const dy = ev.clientY - startY;
      if (dy !== 0) moved = true;
      setLive(dragPreviewHeight(origin, dy, paneHeightRef.current));
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const direction = event.key === "ArrowDown" ? 1 : -1;
    publish(nudgePreviewHeight(preferredRef.current, paneHeightRef.current, direction));
  };

  const onDoubleClick = () => {
    commit(DEFAULT_PREVIEW_HEIGHT);
  };

  return { paneRef, displayed, bounds, onPointerDown, onKeyDown, onDoubleClick };
}
