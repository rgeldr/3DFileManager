import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  POPOVER_WIDTH,
  clampPopover,
  focusWithoutScroll,
  resetHorizontalScroll,
  type PopoverBox,
} from "../lib/popoverPosition";

function sameBox(current: PopoverBox | null, next: PopoverBox): boolean {
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
  onClose,
  onKeyDown,
  focusRef,
  children,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  label: string;
  onClose: () => void;
  onKeyDown: (event: KeyboardEvent) => void;
  focusRef: { readonly current: HTMLElement | null };
  children: ReactNode;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<PopoverBox | null>(null);

  const place = () => {
    const anchor = anchorRef.current;
    const popover = popoverRef.current;
    if (!anchor || !popover) return;
    const rect = anchor.getBoundingClientRect();
    const next = clampPopover({
      anchor: rect,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      width: POPOVER_WIDTH,
      height: popover.scrollHeight,
    });
    setBox((current) => (sameBox(current, next) ? current : next));
  };

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    focusWithoutScroll(focusRef.current);
  }, [focusRef]);

  useLayoutEffect(() => {
    place();
  });

  useEffect(() => {
    resetHorizontalScroll();
    const onResize = () => place();
    const onScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && popoverRef.current?.contains(target)) return;
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
