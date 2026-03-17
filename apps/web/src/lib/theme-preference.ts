export const THEME_STORAGE_KEY = "mc.theme";

export type Theme = "light" | "dark";

export function parseThemePreference(value: string | null): Theme {
  return value === "light" ? "light" : "dark";
}

export function serializeThemePreference(theme: Theme): string {
  return theme;
}
