import { clampInspector, clampSidebar } from "./paneWidths";

export type PaneSplitDeps = {
  sidebarWidthRef: { current: number };
  inspectorWidthRef: { current: number };
  setSidebarWidth: (width: number) => void;
  setInspectorWidth: (width: number) => void;
  persistWidths: (sidebar: number, inspector: number) => void;
};

export function attachPaneSplitPointer(
  which: "sidebar" | "inspector",
  handle: HTMLElement,
  startClientX: number,
  pointerId: number,
  deps: PaneSplitDeps,
): () => void {
  const origin = which === "sidebar" ? deps.sidebarWidthRef.current : deps.inspectorWidthRef.current;
  let moved = false;
  const move = (ev: PointerEvent) => {
    const dx = ev.clientX - startClientX;
    if (dx !== 0) moved = true;
    if (which === "sidebar") {
      const next = clampSidebar(origin + dx, window.innerWidth);
      deps.sidebarWidthRef.current = next;
      deps.setSidebarWidth(next);
    } else {
      const next = clampInspector(origin - dx, window.innerWidth);
      deps.inspectorWidthRef.current = next;
      deps.setInspectorWidth(next);
    }
  };
  const up = (ev: PointerEvent) => {
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", up);
    if (handle.hasPointerCapture(ev.pointerId)) handle.releasePointerCapture(ev.pointerId);
    if (!moved) return;
    deps.persistWidths(deps.sidebarWidthRef.current, deps.inspectorWidthRef.current);
  };
  handle.setPointerCapture(pointerId);
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", up);
  return () => {
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", up);
  };
}
