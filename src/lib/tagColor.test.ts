import { describe, expect, it } from "vitest";
import {
  TAG_PALETTE,
  displayTagColor,
  effectiveTagColor,
  rememberTagColor,
  setCustomTagColor,
  tagAutoColor,
  tagTextColor,
  type StoredTagColor,
} from "./tagColor";

function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const rgb = hex.replace("#", "");
    const channel = (value: number) => {
      const s = value / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const r = Number.parseInt(rgb.slice(0, 2), 16);
    const g = Number.parseInt(rgb.slice(2, 4), 16);
    const b = Number.parseInt(rgb.slice(4, 6), 16);
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const left = lum(a);
  const right = lum(b);
  const [hi, lo] = left > right ? [left, right] : [right, left];
  return (hi + 0.05) / (lo + 0.05);
}

describe("tag colors", () => {
  it("assigns a palette color once and keeps it", () => {
    const first = tagAutoColor("Flexi");
    expect(TAG_PALETTE).toContain(first);
    expect(tagAutoColor("flexi")).toBe(first);
    expect(tagAutoColor("  Flexi  ")).toBe(first);
    expect(rememberTagColor("", "Flexi")).toBe(first);
    expect(rememberTagColor("#123456", "Flexi")).toBe("#123456");
    expect(rememberTagColor(first, "Flexi")).toBe(first);
    expect(tagAutoColor("FDM")).toBe("#2f6e32");
  });

  it("uses a custom color until it is reset to the automatic color", () => {
    const tag: StoredTagColor = { name: "FDM", autoColor: tagAutoColor("FDM"), customColor: null };
    expect(effectiveTagColor(tag)).toBe(tag.autoColor);
    const custom = setCustomTagColor(tag, "#336699");
    expect(effectiveTagColor(custom)).toBe("#336699");
    expect(custom.autoColor).toBe(tag.autoColor);
    const reset = setCustomTagColor(custom, null);
    expect(reset.customColor).toBeNull();
    expect(effectiveTagColor(reset)).toBe(tag.autoColor);
  });

  it("keeps palette chips and custom extremes readable", () => {
    for (const color of TAG_PALETTE) {
      expect(contrast(color, tagTextColor(color))).toBeGreaterThanOrEqual(4.5);
    }
    expect(tagTextColor("#ffffff")).toBe("#142018");
    expect(tagTextColor("#111111")).toBe("#f4fbf7");
  });

  it("prefers a stored color over the automatic one", () => {
    expect(displayTagColor("Resin", [{ name: "resin", color: "#224466" }])).toBe("#224466");
    expect(displayTagColor("Resin", [])).toBe(tagAutoColor("Resin"));
  });
});
