/** Match FileGrid marquee edge scrolling. */
export const PANE_SCROLL_EDGE = 28;
export const PANE_SCROLL_MAX = 18;

export function scrollPaneAtPointer(_clientX: number, clientY: number, pane: HTMLElement): void {
  const bounds = pane.getBoundingClientRect();
  const topDist = clientY - bounds.top;
  const bottomDist = bounds.bottom - clientY;
  if (topDist < PANE_SCROLL_EDGE) {
    pane.scrollTop -= Math.ceil(((PANE_SCROLL_EDGE - topDist) / PANE_SCROLL_EDGE) * PANE_SCROLL_MAX);
  } else if (bottomDist < PANE_SCROLL_EDGE) {
    pane.scrollTop += Math.ceil(((PANE_SCROLL_EDGE - bottomDist) / PANE_SCROLL_EDGE) * PANE_SCROLL_MAX);
  }
}

export function scrollPanesUnderPointer(
  clientX: number,
  clientY: number,
  panes: (HTMLElement | null | undefined)[],
): void {
  for (const pane of panes) {
    if (!pane) continue;
    const bounds = pane.getBoundingClientRect();
    if (clientX < bounds.left || clientX > bounds.right || clientY < bounds.top || clientY > bounds.bottom) {
      continue;
    }
    scrollPaneAtPointer(clientX, clientY, pane);
    return;
  }
}
