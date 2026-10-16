export const POPOVER_MARGIN = 8;
export const POPOVER_GAP = 4;
export const POPOVER_WIDTH = 240;

export type AnchorRect = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type PopoverBox = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

export function clampPopover(input: {
  anchor: AnchorRect;
  viewportWidth: number;
  viewportHeight: number;
  width?: number;
  height: number;
  margin?: number;
  gap?: number;
}): PopoverBox {
  const margin = input.margin ?? POPOVER_MARGIN;
  const gap = input.gap ?? POPOVER_GAP;
  const availableWidth = Math.max(0, input.viewportWidth - margin * 2);
  const width = Math.min(Math.max(0, input.width ?? POPOVER_WIDTH), availableWidth);
  let left = input.anchor.right - width;
  const maxLeft = Math.max(margin, input.viewportWidth - margin - width);
  if (left < margin) left = margin;
  if (left > maxLeft) left = maxLeft;

  const belowTop = input.anchor.bottom + gap;
  const spaceBelow = Math.max(0, input.viewportHeight - margin - belowTop);
  const spaceAbove = Math.max(0, input.anchor.top - gap - margin);
  const placeBelow = spaceBelow >= input.height || spaceBelow >= spaceAbove;
  const fitted = Math.min(Math.max(0, input.height), placeBelow ? spaceBelow : spaceAbove);
  let top = placeBelow ? belowTop : input.anchor.top - gap - fitted;
  let maxHeight = fitted;
  if (top < margin) {
    maxHeight -= margin - top;
    top = margin;
  }
  const bottomLimit = input.viewportHeight - margin;
  if (top + maxHeight > bottomLimit) maxHeight = bottomLimit - top;
  if (maxHeight < 0) maxHeight = 0;
  return { top, left, width, maxHeight };
}

export function resetHorizontalScroll(doc: Document = document): void {
  const nodes = [doc.documentElement, doc.body, doc.getElementById("root"), doc.querySelector(".app")];
  for (const node of nodes) {
    if (node instanceof HTMLElement) node.scrollLeft = 0;
  }
}

export function focusWithoutScroll(node: HTMLElement | null | undefined): void {
  node?.focus({ preventScroll: true });
}

export function scrollListOption(list: HTMLElement | null): void {
  const option = list?.querySelector<HTMLElement>(".is-highlight");
  if (!list || !option) return;
  const listRect = list.getBoundingClientRect();
  const optionRect = option.getBoundingClientRect();
  if (optionRect.top < listRect.top) list.scrollTop -= listRect.top - optionRect.top;
  else if (optionRect.bottom > listRect.bottom) list.scrollTop += optionRect.bottom - listRect.bottom;
}
