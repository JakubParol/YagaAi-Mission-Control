import { Activity, ClipboardList } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface SubPage {
  href: string;
  label: string;
}

export interface NavModule {
  href: string;
  label: string;
  icon: LucideIcon;
  subPages?: SubPage[];
}

export const navModules: NavModule[] = [
  { href: "/dashboard", label: "Dashboard", icon: Activity },
  {
    href: "/planning",
    label: "Planning",
    icon: ClipboardList,
    subPages: [
      { href: "/planning/board", label: "Board" },
      { href: "/planning/stories", label: "Stories" },
    ],
  },
];

export function isModuleActive(pathname: string, mod: NavModule): boolean {
  return pathname === mod.href || pathname.startsWith(`${mod.href}/`);
}

export function getActiveModule(pathname: string): NavModule | undefined {
  return navModules.find((mod) => isModuleActive(pathname, mod));
}
