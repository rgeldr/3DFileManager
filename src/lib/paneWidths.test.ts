import { describe, expect, it } from "vitest";
import { clampInspector, clampSidebar } from "./paneWidths";

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
});
