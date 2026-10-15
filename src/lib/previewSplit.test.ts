import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREVIEW_HEIGHT,
  DETAILS_MIN,
  PREVIEW_MAX,
  PREVIEW_MIN,
  PREVIEW_SPLITTER,
  clampPreviewHeight,
  dragPreviewHeight,
  nudgePreviewHeight,
  persistPreviewHeight,
  previewHeightBounds,
  resetPreviewHeight,
} from "./previewSplit";

const inspectorCss = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../styles/inspector.css"),
  "utf8",
);

describe("preview split", () => {
  it("clamps the preview between 120px and the pane minus the details minimum", () => {
    const pane = 800;
    expect(previewHeightBounds(pane)).toEqual({
      min: PREVIEW_MIN,
      max: pane - PREVIEW_SPLITTER - DETAILS_MIN,
    });
    expect(clampPreviewHeight(80, pane)).toBe(120);
    expect(clampPreviewHeight(240, pane)).toBe(240);
    expect(clampPreviewHeight(900, pane)).toBe(646);
    expect(clampPreviewHeight(120.4, pane)).toBe(120);
  });

  it("keeps both mins when they fit and stays inside a shorter pane", () => {
    expect(clampPreviewHeight(400, PREVIEW_MIN + DETAILS_MIN + PREVIEW_SPLITTER)).toBe(PREVIEW_MIN);
    expect(clampPreviewHeight(10, 204)).toBe(50);
    expect(clampPreviewHeight(400, 204)).toBe(50);
    expect(clampPreviewHeight(-20, 100)).toBe(0);
    expect(clampPreviewHeight(80, 100)).toBe(80);
    expect(clampPreviewHeight(500, 100)).toBe(96);
    expect(clampPreviewHeight(240, 0)).toBe(0);
  });

  it("persists a height inside the saved range and restores the default", () => {
    expect(persistPreviewHeight(300, 800)).toBe(300);
    expect(persistPreviewHeight(40, 800)).toBe(PREVIEW_MIN);
    expect(persistPreviewHeight(900, 800)).toBe(646);
    expect(persistPreviewHeight(50, 100)).toBe(PREVIEW_MIN);
    expect(persistPreviewHeight(9000, 0)).toBe(PREVIEW_MAX);
    expect(persistPreviewHeight(10, 0)).toBe(PREVIEW_MIN);
    expect(persistPreviewHeight(Number.NaN, 0)).toBe(DEFAULT_PREVIEW_HEIGHT);
    expect(resetPreviewHeight(800)).toBe(DEFAULT_PREVIEW_HEIGHT);
    expect(resetPreviewHeight(204)).toBe(PREVIEW_MIN);
    expect(resetPreviewHeight(0)).toBe(DEFAULT_PREVIEW_HEIGHT);
  });

  it("steps with the arrow keys and follows a vertical drag", () => {
    expect(nudgePreviewHeight(240, 800, 1)).toBe(256);
    expect(nudgePreviewHeight(240, 800, -1)).toBe(224);
    expect(nudgePreviewHeight(120, 800, -1)).toBe(120);
    expect(nudgePreviewHeight(646, 800, 1)).toBe(646);
    expect(nudgePreviewHeight(400, 500, -1)).toBe(330);
    expect(dragPreviewHeight(240, 80, 800)).toBe(320);
    expect(dragPreviewHeight(240, -200, 800)).toBe(120);
    expect(dragPreviewHeight(240, 40, 204)).toBe(50);
    expect(dragPreviewHeight(240, 80.2, 0)).toBe(320);
    expect(persistPreviewHeight(dragPreviewHeight(240, 80, 800), 800)).toBe(320);
  });

  it("styles the splitter with theme tokens and a row-resize cursor", () => {
    const splitter = inspectorCss.match(/\.preview-splitter\s*\{[^}]*\}/s)?.[0] ?? "";
    const focus = inspectorCss.match(/\.preview-splitter:hover,\s*\.preview-splitter:focus\s*\{[^}]*\}/s)?.[0] ?? "";
    expect(splitter).toMatch(/cursor:\s*row-resize/);
    expect(splitter).toMatch(/flex:\s*0 0 var\(--space-1\)/);
    expect(splitter).toMatch(/background:\s*var\(--color-divider\)/);
    expect(splitter).not.toMatch(/#/);
    expect(focus).toMatch(/background:\s*var\(--color-accent\)/);
    expect(inspectorCss).toMatch(/flex:\s*0 0 var\(--preview-height, 240px\)/);
    expect(inspectorCss).toMatch(/\.inspector-body\s*\{[^}]*min-height:\s*0;[^}]*overflow:\s*auto/s);
  });
});
