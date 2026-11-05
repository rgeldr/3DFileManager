import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { attachPaneSplitPointer } from "./paneSplitPointer";
import { clampInspector, clampSidebar } from "./paneWidths";

describe("attachPaneSplitPointer", () => {
  it("updates sidebar width and persists after a drag", () => {
    const previousWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1600 });
    const sidebarWidthRef = { current: 240 };
    const inspectorWidthRef = { current: 320 };
    const setSidebarWidth = vi.fn();
    const persistWidths = vi.fn();
    const handle = document.createElement("div");
    handle.setPointerCapture = vi.fn();
    handle.releasePointerCapture = vi.fn();
    handle.hasPointerCapture = () => true;

    attachPaneSplitPointer("sidebar", handle, 800, 1, {
      sidebarWidthRef,
      inspectorWidthRef,
      setSidebarWidth,
      setInspectorWidth: vi.fn(),
      persistWidths,
    });

    fireEvent.pointerMove(handle, { clientX: 850, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 850, pointerId: 1 });

    expect(setSidebarWidth).toHaveBeenCalledWith(clampSidebar(290, 1600));
    expect(persistWidths).toHaveBeenCalledWith(clampSidebar(290, 1600), 320);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: previousWidth });
  });

  it("does not persist when the pointer did not move", () => {
    const persistWidths = vi.fn();
    const handle = document.createElement("div");
    handle.setPointerCapture = vi.fn();
    handle.releasePointerCapture = vi.fn();
    handle.hasPointerCapture = () => true;

    attachPaneSplitPointer("inspector", handle, 500, 2, {
      sidebarWidthRef: { current: 240 },
      inspectorWidthRef: { current: 320 },
      setSidebarWidth: vi.fn(),
      setInspectorWidth: vi.fn(),
      persistWidths,
    });

    fireEvent.pointerUp(handle, { clientX: 500, pointerId: 2 });
    expect(persistWidths).not.toHaveBeenCalled();
  });

  it("shrinks inspector width when dragging left", () => {
    const inspectorWidthRef = { current: 320 };
    const setInspectorWidth = vi.fn();
    const handle = document.createElement("div");
    handle.setPointerCapture = vi.fn();
    handle.releasePointerCapture = vi.fn();
    handle.hasPointerCapture = () => true;

    attachPaneSplitPointer("inspector", handle, 800, 3, {
      sidebarWidthRef: { current: 240 },
      inspectorWidthRef,
      setSidebarWidth: vi.fn(),
      setInspectorWidth,
      persistWidths: vi.fn(),
    });

    fireEvent.pointerMove(handle, { clientX: 700, pointerId: 3 });
    expect(setInspectorWidth).toHaveBeenCalledWith(clampInspector(420, window.innerWidth));
  });
});
