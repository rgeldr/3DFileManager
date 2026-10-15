import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { api } from "../api";
import { debugLog } from "../debugLog";
import { dragSourceKey, dragSources, fileDragOptions, nativeDragDecision, pointerOutsideWindow, pointerPastSlop, suppressHtmlDrag } from "../lib/dragOut";
import type { DragReport, FileRow } from "../types";
import type { FileDrag } from "./libraryTypes";

type RunDisk = (opts: {
  title: string;
  cancellable: boolean;
  success: string;
  cancelled: string;
  run: () => Promise<{ cancelled: boolean }>;
  after?: () => Promise<void> | void;
}) => Promise<void>;

export function useFileDrag(s: {
  dragRef: { current: FileDrag | null };
  filesRef: { current: FileRow[] };
  tryStartRef: { current: () => void };
  prefetchRef: { current: (ids: number[]) => void };
  dragPrepCache: { current: { key: string; paths: string[]; skipped: string[]; reports: DragReport[] } | null };
  dragIconRef: { current: string | null };
  selected: number[];
  showToast: (message: string) => void;
  setDragFailure: (failure: { message: string; fileId: number } | null) => void;
  runDiskOp: RunDisk;
}) {
  const {
    dragRef, filesRef, tryStartRef, prefetchRef, dragPrepCache, dragIconRef,
    selected, showToast, setDragFailure, runDiskOp,
  } = s;
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const releaseDragCapture = (node: HTMLElement | null, pointerId: number) => {
    if (node?.hasPointerCapture(pointerId)) node.releasePointerCapture(pointerId);
  };

  prefetchRef.current = (ids) => {
    const sources = dragSources(filesRef.current, ids);
    if (sources.length === 0) return;
    const key = dragSourceKey(sources);
    const apply = (
      prepared: { paths: string[]; skipped: string[]; reports: DragReport[] },
      error: string | null,
    ) => {
      dragPrepCache.current = { key, paths: prepared.paths, skipped: prepared.skipped, reports: prepared.reports };
      const drag = dragRef.current;
      if (!drag || drag.prepKey !== key) return;
      drag.paths = prepared.paths;
      drag.skipped = prepared.skipped;
      drag.reports = prepared.reports;
      drag.prepareError = error;
      drag.pathsReady = true;
      tryStartRef.current();
    };
    const cached = dragPrepCache.current;
    if (cached?.key === key) {
      apply(cached, null);
      return;
    }
    void api.prepareDragPaths(sources, dragIconRef.current ?? "").then(
      (prepared) => apply(prepared, null),
      (err: unknown) => apply({ paths: [], skipped: [], reports: [] }, String(err)),
    );
  };

  tryStartRef.current = () => {
    const drag = dragRef.current;
    if (!drag) return;
    const decision = nativeDragDecision({
      buttonDown: drag.buttonDown,
      pastSlop: pointerPastSlop(drag.originX, drag.originY, drag.x, drag.y),
      outside: pointerOutsideWindow(drag.x, drag.y, window.innerWidth, window.innerHeight),
      started: drag.startedNative,
      pathsReady: drag.pathsReady,
      imageDrag: drag.imageDrag,
    });
    if (decision === "wait-for-paths") {
      if (!drag.loggedWait) {
        drag.loggedWait = true;
        debugLog("drag-wait", { reason: "paths", x: Math.round(drag.x), y: Math.round(drag.y) });
      }
      return;
    }
    if (decision !== "start" || !drag.paths) return;
    drag.startedNative = true;
    releaseDragCapture(drag.captureEl, drag.pointerId);
    const fileId = drag.ids[0];
    if (drag.paths.length === 0) {
      const message = drag.prepareError
        || drag.reports.map((item) => item.error).filter(Boolean).join("\n")
        || "Could not drag these files.";
      debugLog("drag-result", { result: "error", effect: "none", message });
      setDragFailure({ message, fileId });
      return;
    }
    if (drag.skipped.length > 0) showToast(`Skipped: ${drag.skipped.join(", ")}`);
    const paths = drag.paths.slice();
    const icon = dragIconRef.current ?? "";
    let options: { item: string[]; icon: string };
    try {
      options = fileDragOptions(paths, icon);
    } catch (err) {
      debugLog("drag-result", { result: "error", effect: "none", message: String(err) });
      setDragFailure({ message: String(err), fileId });
      return;
    }
    debugLog("drag-start", { count: options.item.length, paths: options.item, icon: options.icon });
    void startDrag({ item: options.item, icon: options.icon, mode: "copy" }, (payload) => {
      debugLog("drag-result", { result: payload.result, effect: "copy", icon: options.icon });
    }).catch((err: unknown) => {
      debugLog("drag-result", { result: "error", effect: "none", message: String(err) });
      setDragFailure({ message: String(err), fileId });
    });
  };

  useEffect(() => {
    const timer = window.setTimeout(() => prefetchRef.current(selected), 200);
    return () => window.clearTimeout(timer);
  }, [selected]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag.x = event.clientX;
      drag.y = event.clientY;
      drag.buttonDown = (event.buttons & 1) === 1;
      tryStartRef.current();
      if (drag.startedNative) {
        setDropTarget(null);
        return;
      }
      const element = document.elementFromPoint(event.clientX, event.clientY);
      const folder = element?.closest("[data-folder-id]")?.getAttribute("data-folder-id") ?? null;
      setDropTarget(folder);
    };
    const onUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag.buttonDown = false;
      drag.x = event.clientX;
      drag.y = event.clientY;
      const started = drag.startedNative;
      const moved = pointerPastSlop(drag.originX, drag.originY, drag.x, drag.y);
      const ids = drag.ids.slice();
      dragRef.current = null;
      releaseDragCapture(drag.captureEl, event.pointerId);
      setDropTarget(null);
      if (!moved || started) return;
      const element = document.elementFromPoint(event.clientX, event.clientY);
      const folder = element?.closest("[data-folder-id]")?.getAttribute("data-folder-id");
      if (!folder) return;
      const folderId = folder === "root" ? null : Number(folder);
      const moving = filesRef.current.filter((file) => ids.includes(file.id));
      const title = moving.length === 1
        ? `Moving "${moving[0]?.sortName ?? "file"}"...`
        : `Moving ${moving.length} files...`;
      void runDiskOp({
        title,
        cancellable: true,
        success: moving.length === 1 ? `Moved "${moving[0]?.sortName ?? "file"}"` : `Moved ${moving.length} files`,
        cancelled: "Move cancelled",
        run: () => api.moveFiles(ids, folderId),
      });
    };
    const blockDrag = (event: DragEvent) => {
      if (!suppressHtmlDrag(event)) return;
      const drag = dragRef.current;
      if (!drag || drag.startedNative) return;
      drag.imageDrag = true;
      tryStartRef.current();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("dragstart", blockDrag, true);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("dragstart", blockDrag, true);
    };
  }, [runDiskOp]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const tile = (event.target as HTMLElement).closest("[data-file-id]");
    if (!tile || event.button !== 0) return;
    const id = Number(tile.getAttribute("data-file-id"));
    if (!Number.isFinite(id)) return;
    const ids = selected.includes(id) ? selected.slice() : [id];
    const sources = dragSources(filesRef.current, ids);
    dragRef.current = {
      pointerId: event.pointerId,
      ids,
      originX: event.clientX,
      originY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      buttonDown: true,
      startedNative: false,
      captureEl: tile instanceof HTMLElement ? tile : null,
      prepKey: dragSourceKey(sources),
      paths: null,
      pathsReady: false,
      imageDrag: false,
      skipped: [],
      reports: [],
      prepareError: null,
      loggedWait: false,
    };
    if (tile instanceof HTMLElement) {
      try {
        tile.setPointerCapture(event.pointerId);
      } catch {
        // The pointer can already be gone.
      }
    }
    prefetchRef.current(ids);
  };
  return { dropTarget, onPointerDown };
}
