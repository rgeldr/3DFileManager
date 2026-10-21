/** Option values for a comma-separated tag field.
 *  The browser matches the whole input against each option, so a later tag is
 *  suggested as the earlier text plus that one tag.
 */
export function commaTagOptions(input: string, tags: string[]): string[] {
  const comma = input.lastIndexOf(",");
  if (comma < 0) return tags;
  const after = input.slice(comma + 1);
  const segment = after.trim().toLowerCase();
  const leading = /^\s*/.exec(after)?.[0] ?? "";
  const base = input.slice(0, comma + 1) + leading;
  return tags
    .filter((tag) => segment === "" || tag.toLowerCase().startsWith(segment))
    .map((tag) => base + tag);
}

/** Split a comma-separated field onto the chips already chosen. Blank pieces and
 *  names already present (ignoring case) are left out. The first spelling wins.
 */
export function appendCommaTags(existing: string[], input: string): string[] {
  const next = [...existing];
  for (const part of input.split(",")) {
    const tag = part.trim();
    if (!tag || next.some((item) => item.toLowerCase() === tag.toLowerCase())) continue;
    next.push(tag);
  }
  return next;
}

/** Enter commits every tag in the field. A comma stays typed so suggestions can
 *  match the segment after it. Null means the key should be typed as usual.
 */
export function tagFieldKey(
  existing: string[],
  input: string,
  key: string,
): { tags: string[]; text: string } | null {
  if (key !== "Enter") return null;
  return { tags: appendCommaTags(existing, input), text: "" };
}
