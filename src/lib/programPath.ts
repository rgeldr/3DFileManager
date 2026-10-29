export function windowsStyle(path: string): boolean {
  if (path.startsWith("\\\\") || path.startsWith("//")) return true;
  return /^[A-Za-z]:/.test(path);
}

export function collapseBackslashes(path: string): string {
  return path.replace(/\\+/g, "\\");
}

/** Drive and UNC paths use `\`. Other paths are only trimmed. */
export function normalizeProgramPath(path: string): string {
  const trimmed = path.trim();
  if (!windowsStyle(trimmed)) return trimmed;
  const slashed = trimmed.replaceAll("/", "\\");
  if (trimmed.startsWith("\\\\") || trimmed.startsWith("//")) {
    return `\\\\${collapseBackslashes(slashed.replace(/^\\+/, ""))}`;
  }
  return collapseBackslashes(slashed);
}

export function sameProgramPath(left: string, right: string): boolean {
  return normalizeProgramPath(left) === normalizeProgramPath(right);
}
