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
