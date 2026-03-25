import { Activity, ClipboardList, FlaskConical, Radar } from "lucide-react";
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
      { href: "/planning/backlog", label: "Backlog" },
      { href: "/planning/list", label: "List" },
      { href: "/planning/epics-overview", label: "Epics" },
      { href: "/planning/settings", label: "Settings" },
    ],
  },
  {
    href: "/control-plane",
    label: "Control Plane",
    icon: Radar,
    subPages: [
      { href: "/control-plane/dashboard", label: "Dashboard" },
      { href: "/control-plane/timeline", label: "Timeline" },
    ],
  },
  {
    href: "/tests",
    label: "Tests",
    icon: FlaskConical,
    subPages: [{ href: "/tests/test1", label: "Test1" }],
  },
];

export function isModuleActive(pathname: string, mod: NavModule): boolean {
  return pathname === mod.href || pathname.startsWith(`${mod.href}/`);
}

export function getActiveModule(pathname: string): NavModule | undefined {
  return navModules.find((mod) => isModuleActive(pathname, mod));
}
