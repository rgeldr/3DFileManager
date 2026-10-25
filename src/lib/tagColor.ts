/** Pleasant chip backgrounds. Text color is chosen so each stays readable on light and dark themes. */
export const TAG_PALETTE = [
  "#1f6b4a",
  "#1d5f8a",
  "#3d4f99",
  "#6a3d8a",
  "#8a3d62",
  "#8a4630",
  "#8a641f",
  "#2f6e32",
  "#1f6a66",
  "#3a5278",
  "#7a3048",
  "#5a4630",
  "#245e58",
  "#2c4578",
  "#6e3a6e",
  "#6e4a28",
] as const;

const LIGHT_TEXT = "#f4fbf7";
const DARK_TEXT = "#142018";

export interface StoredTagColor {
  name: string;
  autoColor: string;
  customColor: string | null;
}

/** Stable palette color for a tag name. The same name always maps to the same color. */
export function tagAutoColor(name: string): string {
  let hash = 0;
  for (const char of name.trim().toLowerCase()) {
    hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  }
  return TAG_PALETTE[hash % TAG_PALETTE.length];
}

/** Fill a missing automatic color once. A color that is already stored is left alone. */
export function rememberTagColor(existing: string | null | undefined, name: string): string {
  const stored = existing?.trim();
  return stored ? stored : tagAutoColor(name);
}

export function effectiveTagColor(tag: StoredTagColor): string {
  const custom = tag.customColor?.trim();
  if (custom) return custom;
  return rememberTagColor(tag.autoColor, tag.name);
}

export function setCustomTagColor(tag: StoredTagColor, color: string | null): StoredTagColor {
  const next = color?.trim() || null;
  return { ...tag, customColor: next };
}

function channel(value: number): number {
  const s = value / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const rgb = hex.replace("#", "");
  const r = Number.parseInt(rgb.slice(0, 2), 16);
  const g = Number.parseInt(rgb.slice(2, 4), 16);
  const b = Number.parseInt(rgb.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): number {
  const left = relativeLuminance(a);
  const right = relativeLuminance(b);
  const [hi, lo] = left > right ? [left, right] : [right, left];
  return (hi + 0.05) / (lo + 0.05);
}

/** Pick the light or dark text color that contrasts more with this chip background. */
export function tagTextColor(background: string): string {
  return contrast(background, DARK_TEXT) > contrast(background, LIGHT_TEXT) ? DARK_TEXT : LIGHT_TEXT;
}

export function tagChipStyle(color: string): { background: string; color: string; borderColor: string } {
  return { background: color, color: tagTextColor(color), borderColor: color };
}

export function displayTagColor(name: string, tags: { name: string; color?: string }[]): string {
  const found = tags.find((tag) => tag.name.toLowerCase() === name.toLowerCase());
  return rememberTagColor(found?.color, name);
}
