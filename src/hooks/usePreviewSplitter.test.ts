import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PREVIEW_HEIGHT, PREVIEW_KEY_STEP } from "../lib/previewSplit";
import { usePreviewSplitter } from "./usePreviewSplitter";

class FakeResizeObserver {
  static last: FakeResizeObserver | null = null;
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    FakeResizeObserver.last = this;
  }
  observe() {
    this.callback([], this);
  }
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  FakeResizeObserver.last = null;
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function attachPane(result: { current: ReturnType<typeof usePreviewSplitter> }, height = 800) {
  const pane = document.createElement("div");
  Object.defineProperty(pane, "clientHeight", { configurable: true, get: () => height });
  act(() => {
    result.current.paneRef(pane);
  });
  return pane;
}

describe("usePreviewSplitter", () => {
  it("nudges height with arrow keys and commits via persistPreviewHeight", () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => usePreviewSplitter(240, onCommit));
    attachPane(result, 800);

    const event = {
      key: "ArrowDown",
      preventDefault: vi.fn(),
    } as unknown as React.KeyboardEvent<HTMLDivElement>;
    act(() => {
      result.current.onKeyDown(event);
    });
    expect(event.preventDefault).toHaveBeenCalled();
    expect(onCommit).toHaveBeenCalledWith(240 + PREVIEW_KEY_STEP);
  });

  it("commits a drag when the pointer moves, and cancels without a move", () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => usePreviewSplitter(240, onCommit));
    attachPane(result, 800);

    const handle = document.createElement("div");
    const listeners = new Map<string, EventListener>();
    handle.addEventListener = ((type: string, listener: EventListener) => {
      listeners.set(type, listener);
    }) as typeof handle.addEventListener;
    handle.removeEventListener = ((type: string) => {
      listeners.delete(type);
    }) as typeof handle.removeEventListener;
    handle.setPointerCapture = vi.fn();
    handle.releasePointerCapture = vi.fn();
    handle.hasPointerCapture = vi.fn(() => true);

    act(() => {
      result.current.onPointerDown({
        button: 0,
        detail: 1,
        pointerId: 1,
        clientY: 100,
        preventDefault() {},
        stopPropagation() {},
        currentTarget: handle,
      } as unknown as React.PointerEvent<HTMLDivElement>);
    });

    act(() => {
      listeners.get("pointerup")?.(
        { pointerId: 1, clientY: 100 } as unknown as PointerEvent,
      );
    });
    expect(onCommit).not.toHaveBeenCalled();

    act(() => {
      result.current.onPointerDown({
        button: 0,
        detail: 1,
        pointerId: 2,
        clientY: 100,
        preventDefault() {},
        stopPropagation() {},
        currentTarget: handle,
      } as unknown as React.PointerEvent<HTMLDivElement>);
    });
    act(() => {
      listeners.get("pointermove")?.(
        { pointerId: 2, clientY: 180 } as unknown as PointerEvent,
      );
    });
    act(() => {
      listeners.get("pointerup")?.(
        { pointerId: 2, clientY: 180 } as unknown as PointerEvent,
      );
    });
    expect(onCommit).toHaveBeenCalledWith(320);
  });

  it("resets to the default height on double-click", () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => usePreviewSplitter(320, onCommit));
    attachPane(result, 800);
    act(() => {
      result.current.onDoubleClick();
    });
    expect(onCommit).toHaveBeenCalledWith(DEFAULT_PREVIEW_HEIGHT);
  });
});
