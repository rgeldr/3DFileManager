import groups from "../supportedTypes.json";
import type { TypeCount } from "../types";

export type SupportedTypeGroup = { id: string; label: string; exts: string[] };

export const SUPPORTED_TYPE_GROUPS = groups as SupportedTypeGroup[];

/** Show the popover search once the catalog is long enough to scroll. */
export const TYPE_SEARCH_MIN = 8;

export function typeFilterShowsSearch(count: number): boolean {
  return count > TYPE_SEARCH_MIN;
}

export function filterTypeOptions(types: TypeCount[], query: string): TypeCount[] {
  const needle = query.trim().toLowerCase();
  const sorted = [...types].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  if (!needle) return sorted;
  return sorted.filter((type) => {
    const haystack = `${type.label} ${type.exts.join(" ")}`.toLowerCase();
    return haystack.includes(needle);
  });
}

export function toggleTypeId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

export function typeFilterBadge(count: number): string {
  return count > 0 ? `File Types (${count})` : "File Types";
}

export function extsForSelectedTypes(ids: string[]): string[] {
  const selected = new Set(ids);
  const exts: string[] = [];
  for (const group of SUPPORTED_TYPE_GROUPS) {
    if (!selected.has(group.id)) continue;
    for (const ext of group.exts) {
      if (!exts.includes(ext)) exts.push(ext);
    }
  }
  return exts;
}

export function mergeTypeCounts(counts: TypeCount[]): TypeCount[] {
  const byId = new Map(counts.map((type) => [type.id, type]));
  return SUPPORTED_TYPE_GROUPS.map((group) => {
    const found = byId.get(group.id);
    return {
      id: group.id,
      label: group.label,
      exts: group.exts,
      fileCount: found?.fileCount ?? 0,
    };
  });
}
