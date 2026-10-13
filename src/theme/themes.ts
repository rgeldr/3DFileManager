export type ThemeName = "dark" | "light";

export const DEFAULT_THEME: ThemeName = "dark";

export function isThemeName(value: string | null | undefined): value is ThemeName {
  return value === "dark" || value === "light";
}
