import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  POPOVER_WIDTH,
  clampPopover,
  focusWithoutScroll,
  isIgnoredPopoverScroll,
  resetHorizontalScroll,
  type PopoverBox,
} from "../lib/popoverPosition";

export function roundBox(box: PopoverBox): PopoverBox {
  return {
    top: Math.round(box.top),
    left: Math.round(box.left),
    width: Math.round(box.width),
    maxHeight: Math.round(box.maxHeight),
  };
}

export function sameBox(current: PopoverBox | null, next: PopoverBox): boolean {
  return (
    current !== null &&
    current.top === next.top &&
    current.left === next.left &&
    current.width === next.width &&
    current.maxHeight === next.maxHeight
  );
}

export function FilterPopover({
  anchorRef,
  label,
  layoutKey,
  onClose,
  onKeyDown,
  focusRef,
  children,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  label: string;
  layoutKey: string;
  onClose: () => void;
  onKeyDown: (event: KeyboardEvent) => void;
  focusRef: { readonly current: HTMLElement | null };
  children: ReactNode;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const placed = useRef<PopoverBox | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [box, setBox] = useState<PopoverBox | null>(null);

  const placeRef = useRef(() => undefined);
  placeRef.current = () => {
    const anchor = anchorRef.current;
    const popover = popoverRef.current;
    if (!anchor || !popover) return;
    const previousMax = popover.style.maxHeight;
    popover.style.maxHeight = "none";
    const height = popover.offsetHeight;
    popover.style.maxHeight = previousMax;
    const rect = anchor.getBoundingClientRect();
    const next = roundBox(clampPopover({
      anchor: rect,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      width: POPOVER_WIDTH,
      height,
    }));
    if (sameBox(placed.current, next)) return;
    placed.current = next;
    setBox(next);
  };

  useLayoutEffect(() => {
    placeRef.current();
  }, [layoutKey]);

  useLayoutEffect(() => {
    focusWithoutScroll(focusRef.current);
  }, [focusRef]);

  useEffect(() => {
    let frame = 0;
    let allowScrollClose = false;
    resetHorizontalScroll();
    const arm = requestAnimationFrame(() => {
      allowScrollClose = true;
    });
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => placeRef.current());
    };
    const onScroll = (event: Event) => {
      if (!allowScrollClose) return;
      if (isIgnoredPopoverScroll(event.target, popoverRef.current, anchorRef.current)) return;
      onCloseRef.current();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (anchorRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      onCloseRef.current();
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    document.addEventListener("scroll", onScroll, true);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      cancelAnimationFrame(arm);
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [anchorRef]);

  return createPortal(
    <div
      ref={popoverRef}
      className="tag-filter-popover"
      role="dialog"
      aria-label={label}
      onKeyDown={onKeyDown}
      style={
        box
          ? { top: box.top, left: box.left, width: box.width, maxHeight: box.maxHeight }
          : { visibility: "hidden" }
      }
    >
      {children}
    </div>,
    document.body,
  );
}
