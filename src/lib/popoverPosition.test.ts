import { describe, expect, it } from "vitest";
import { POPOVER_GAP, POPOVER_MARGIN, POPOVER_WIDTH, clampPopover, type AnchorRect } from "./popoverPosition";

function anchor(rect: Pick<AnchorRect, "top" | "right" | "bottom" | "left">): AnchorRect {
  return rect;
}

function expectInside(box: { top: number; left: number; width: number; maxHeight: number }, viewportWidth: number, viewportHeight: number) {
  expect(box.left).toBeGreaterThanOrEqual(POPOVER_MARGIN);
  expect(box.left + box.width).toBeLessThanOrEqual(viewportWidth - POPOVER_MARGIN);
  expect(box.top).toBeGreaterThanOrEqual(POPOVER_MARGIN);
  expect(box.top + box.maxHeight).toBeLessThanOrEqual(viewportHeight - POPOVER_MARGIN);
}

describe("clampPopover", () => {
  it("right-aligns under the button when the popover fits", () => {
    const box = clampPopover({
      anchor: anchor({ top: 40, right: 1000, bottom: 68, left: 920 }),
      viewportWidth: 1280,
      viewportHeight: 800,
      height: 300,
    });
    expect(box.left).toBe(1000 - POPOVER_WIDTH);
    expect(box.width).toBe(POPOVER_WIDTH);
    expect(box.top).toBe(68 + POPOVER_GAP);
    expect(box.maxHeight).toBe(300);
    expectInside(box, 1280, 800);
  });

  it("shifts a right-edge popover so it stays inside the viewport", () => {
    const box = clampPopover({
      anchor: anchor({ top: 40, right: 1280, bottom: 68, left: 1200 }),
      viewportWidth: 1280,
      viewportHeight: 800,
      height: 320,
    });
    expect(box.left).toBe(1280 - POPOVER_MARGIN - POPOVER_WIDTH);
    expect(box.left + box.width).toBe(1280 - POPOVER_MARGIN);
    expectInside(box, 1280, 800);
  });

  it("shifts right when right-alignment would pass the left margin", () => {
    const box = clampPopover({
      anchor: anchor({ top: 40, right: 100, bottom: 68, left: 20 }),
      viewportWidth: 800,
      viewportHeight: 600,
      height: 200,
    });
    expect(box.left).toBe(POPOVER_MARGIN);
    expectInside(box, 800, 600);
  });

  it("shrinks the width when the viewport is narrower than the popover", () => {
    const box = clampPopover({
      anchor: anchor({ top: 20, right: 190, bottom: 48, left: 110 }),
      viewportWidth: 200,
      viewportHeight: 400,
      height: 180,
    });
    expect(box.width).toBe(200 - POPOVER_MARGIN * 2);
    expect(box.left).toBe(POPOVER_MARGIN);
    expectInside(box, 200, 400);
  });

  it("flips above the button when there is more room above", () => {
    const box = clampPopover({
      anchor: anchor({ top: 700, right: 400, bottom: 728, left: 320 }),
      viewportWidth: 800,
      viewportHeight: 760,
      height: 400,
    });
    expect(box.top).toBe(700 - POPOVER_GAP - 400);
    expect(box.maxHeight).toBe(400);
    expectInside(box, 800, 760);
  });

  it("caps maxHeight so the bottom stays inside a short viewport", () => {
    const box = clampPopover({
      anchor: anchor({ top: 12, right: 400, bottom: 40, left: 320 }),
      viewportWidth: 800,
      viewportHeight: 200,
      height: 500,
    });
    expect(box.top).toBe(40 + POPOVER_GAP);
    expect(box.maxHeight).toBe(200 - POPOVER_MARGIN - box.top);
    expectInside(box, 800, 200);
  });
});
