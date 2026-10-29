import { describe, expect, it } from "vitest";
import { clampInspector, clampRange, clampSidebar, INSPECTOR_RAIL_WIDTH } from "./paneWidths";

describe("clampRange", () => {
  it("rounds into the min and the smaller of the absolute and window caps", () => {
    expect(clampRange(100, 180, 640, 0.5, 1600)).toBe(180);
    expect(clampRange(400.2, 180, 640, 0.5, 1600)).toBe(400);
    expect(clampRange(900, 180, 640, 0.5, 1600)).toBe(640);
    expect(clampRange(400, 180, 640, 0.5, 600)).toBe(300);
    expect(clampSidebar(400, 1600)).toBe(clampRange(400, 180, 640, 0.5, 1600));
  });
});

describe("paneWidths", () => {
  it("clamps the sidebar to 180 through half the window, capped at 640", () => {
    expect(clampSidebar(100, 1600)).toBe(180);
    expect(clampSidebar(900, 1600)).toBe(640);
    expect(clampSidebar(400, 600)).toBe(300);
    expect(clampSidebar(100, 200)).toBe(180);
  });

  it("clamps the inspector to 240 through 45 percent of the window, capped at 560", () => {
    expect(clampInspector(100, 1600)).toBe(240);
    expect(clampInspector(900, 1600)).toBe(560);
    expect(clampInspector(500, 800)).toBe(360);
    expect(clampInspector(100, 200)).toBe(240);
  });

  it("keeps the collapsed inspector rail narrower than the open minimum", () => {
    expect(INSPECTOR_RAIL_WIDTH).toBe(40);
    expect(INSPECTOR_RAIL_WIDTH).toBeLessThan(240);
  });
});
