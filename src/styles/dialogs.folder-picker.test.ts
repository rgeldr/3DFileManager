import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "dialogs.css"), "utf8");

function ruleBlock(source: string, selector: string): string {
  const start = source.indexOf(selector);
  if (start < 0) throw new Error(`missing ${selector}`);
  const open = source.indexOf("{", start);
  const close = source.indexOf("}", open);
  return source.slice(open, close + 1);
}

describe("folder picker layout", () => {
  it("keeps Up in place and ellipsizes the breadcrumb", () => {
    const picker = ruleBlock(css, ".folder-picker {");
    expect(picker).toContain("min-width: 0");

    const toolbar = ruleBlock(css, ".folder-picker-toolbar {");
    expect(toolbar).toContain("flex-wrap: nowrap");
    expect(toolbar).toContain("min-width: 0");
    expect(toolbar).not.toContain("flex-wrap: wrap");

    const crumb = ruleBlock(css, ".folder-picker-toolbar .breadcrumb {");
    expect(crumb).toContain("display: block");
    expect(crumb).toContain("flex: 1 1 0%");
    expect(crumb).toContain("min-width: 0");
    expect(crumb).toContain("overflow: hidden");
    expect(crumb).toContain("text-overflow: ellipsis");
    expect(crumb).toContain("white-space: nowrap");
    expect(crumb).not.toContain("overflow-x: auto");

    const parts = ruleBlock(css, ".folder-picker-toolbar .breadcrumb-part,");
    expect(parts).toContain("max-width: 100%");
    expect(parts).toContain("flex: 0 1 auto");
    expect(parts).not.toContain("flex: 0 0 auto");

    const up = ruleBlock(css, ".folder-picker-up {");
    expect(up).toContain("flex: 0 0 auto");

    const destination = ruleBlock(css, ".folder-picker-destination {");
    expect(destination).toContain("min-width: 0");
    expect(destination).toContain("overflow: hidden");
    expect(destination).toContain("text-overflow: ellipsis");
    expect(destination).toContain("white-space: nowrap");
  });
});
