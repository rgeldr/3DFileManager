/** Three numeric semver parts. A leading "v" and leading zeros are accepted. */
export function parseAppVersion(value: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * True when `latest` is a newer YY.MM.N release than `current`.
 * Comparison is numeric, matching semver, so 26.10.26 is newer than 26.10.9.
 * Returns null when either value is not three numeric parts.
 */
export function isNewerAppVersion(latest: string, current: string): boolean | null {
  const next = parseAppVersion(latest);
  const local = parseAppVersion(current);
  if (!next || !local) return null;
  for (let index = 0; index < 3; index += 1) {
    if (next[index] !== local[index]) return next[index] > local[index];
  }
  return false;
}
