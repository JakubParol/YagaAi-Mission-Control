'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { SubPage } from "@/lib/navigation";

interface ModuleTopBarProps {
  subPages: SubPage[];
}

function isSubPageActive(pathname: string, subPage: SubPage): boolean {
  if (pathname === subPage.href) return true;
  return pathname.startsWith(`${subPage.href}/`);
}

export function ModuleTopBar({ subPages }: ModuleTopBarProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Module navigation"
      className={cn(
        "border-b border-white/[0.08]",
        "bg-slate-900/60 backdrop-blur-md",
      )}
    >
      <div className="mx-auto flex h-11 max-w-7xl items-center gap-1 px-4 sm:px-6">
        {subPages.map((page) => {
          const active = isSubPageActive(pathname, page);

          return (
            <Link
              key={page.href}
              href={page.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "focus-ring relative rounded-md px-3 py-1.5",
                "text-sm font-medium",
                "transition-colors duration-150",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {page.label}
              {active && (
                <span className="absolute inset-x-1 -bottom-[7px] h-0.5 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
