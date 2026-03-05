export const SIDEBAR_COLLAPSED_STORAGE_KEY = "mc.sidebar.collapsed";

export function parseSidebarCollapsedPreference(value: string | null): boolean {
  return value === "true";
}

export function serializeSidebarCollapsedPreference(collapsed: boolean): string {
  return collapsed ? "true" : "false";
}
