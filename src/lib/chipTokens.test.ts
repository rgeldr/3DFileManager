import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const stylesDir = join(dirname(fileURLToPath(import.meta.url)), "../styles");
const tokensCss = readFileSync(join(stylesDir, "tokens.css"), "utf8");
const filterCss = readFileSync(join(stylesDir, "tag-filter.css"), "utf8");
const inspectorCss = readFileSync(join(stylesDir, "inspector.css"), "utf8");

const CHIP_TOKENS = ["chip-type-bg", "chip-type-fg", "chip-type-border", "chip-tag-bg", "chip-tag-fg", "chip-tag-border"] as const;

function themeBlock(theme: "dark" | "light"): string {
  const match = tokensCss.match(new RegExp(`:root\\[data-theme="${theme}"\\] \\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`missing ${theme} theme`);
  return match[1];
}

function token(theme: "dark" | "light", name: string): string {
  const match = themeBlock(theme).match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`missing --${name} in ${theme}`);
  return match[1].toLowerCase();
}

function luminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const raw = ((value >> shift) & 255) / 255;
    return raw <= 0.04045 ? raw / 12.92 : ((raw + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}

function contrast(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

describe("chip color tokens", () => {
  it("defines type and tag chips for both themes", () => {
    expect(token("dark", "chip-type-bg")).toBe("#12386b");
    expect(token("dark", "chip-type-fg")).toBe("#f3f7ff");
    expect(token("dark", "chip-type-border")).toBe("#8fb7ea");
    expect(token("dark", "chip-tag-bg")).toBe("#0f4a34");
    expect(token("dark", "chip-tag-fg")).toBe("#f2fbf6");
    expect(token("dark", "chip-tag-border")).toBe("#7dccaa");
    expect(token("light", "chip-type-bg")).toBe("#d3e4f8");
    expect(token("light", "chip-type-fg")).toBe("#0b2544");
    expect(token("light", "chip-type-border")).toBe("#2f68a8");
    expect(token("light", "chip-tag-bg")).toBe("#d4f0e0");
    expect(token("light", "chip-tag-fg")).toBe("#0c3322");
    expect(token("light", "chip-tag-border")).toBe("#26764c");
  });

  it("keeps chip text at WCAG AA against its background", () => {
    for (const theme of ["dark", "light"] as const) {
      for (const kind of ["type", "tag"] as const) {
        const ratio = contrast(token(theme, `chip-${kind}-fg`), token(theme, `chip-${kind}-bg`));
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(luminance(token("dark", "chip-type-fg"))).toBeGreaterThan(luminance(token("dark", "chip-type-bg")));
    expect(luminance(token("light", "chip-type-fg"))).toBeLessThan(luminance(token("light", "chip-type-bg")));
    expect(luminance(token("dark", "chip-tag-fg"))).toBeGreaterThan(luminance(token("dark", "chip-tag-bg")));
    expect(luminance(token("light", "chip-tag-fg"))).toBeLessThan(luminance(token("light", "chip-tag-bg")));
  });

  it("paints filter chips and inspector tags from those tokens", () => {
    for (const name of CHIP_TOKENS) {
      expect(tokensCss).toContain(`--${name}:`);
    }
    expect(filterCss).not.toMatch(/\.tag-filter-chips \.tag\s*\{[^}]*var\(--chip-tag-bg\)/);
    expect(filterCss).toMatch(/\.tag-filter-chips \.type-chip[\s\S]*var\(--chip-type-bg\)[\s\S]*var\(--chip-type-fg\)[\s\S]*var\(--chip-type-border\)/);
    expect(inspectorCss).toMatch(/\.tag\s*\{[^}]*var\(--chip-tag-bg\)[^}]*var\(--chip-tag-fg\)[^}]*var\(--chip-tag-border\)/s);
  });
});
