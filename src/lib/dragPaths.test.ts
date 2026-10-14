import { describe, expect, it } from "vitest";
import { DRAG_ICON_KIND, iconForDrag, pathLooksUnsafeForDrag } from "./dragPaths";

describe("dragPaths", () => {
  it("always uses the bundled drag icon", () => {
    expect(DRAG_ICON_KIND).toBe("drag.png");
    expect(iconForDrag("C:\\app\\icons\\drag.png")).toBe("C:\\app\\icons\\drag.png");
    expect(iconForDrag("/icons/drag.png")).not.toContain("thumb");
  });

  it("flags extended and over-long paths", () => {
    expect(pathLooksUnsafeForDrag("\\\\?\\C:\\Library\\model.stl")).toBe(true);
    expect(pathLooksUnsafeForDrag(`${"n".repeat(260)}.stl`)).toBe(true);
    expect(pathLooksUnsafeForDrag("C:\\Library\\model.stl")).toBe(false);
  });
});
