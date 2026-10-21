export interface ImportMetaPayload {
  ids: number[];
  creator: string | null;
  tags: string[] | null;
}

export function tagsWithPending(tags: string[], pending: string): string[] {
  const next = pending.trim();
  if (!next || tags.some((tag) => tag.toLowerCase() === next.toLowerCase())) return tags;
  return [...tags, next];
}

export function importMetaPayload(importedIds: number[], creator: string, tags: string[]): ImportMetaPayload | null {
  const trimmed = creator.trim();
  const nextTags = tags.map((tag) => tag.trim()).filter(Boolean);
  if (!trimmed && nextTags.length === 0) return null;
  return {
    ids: importedIds,
    creator: trimmed || null,
    tags: nextTags.length > 0 ? nextTags : null,
  };
}
