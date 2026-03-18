'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { SubPage } from "@/lib/navigation";
import { FloatingCard } from "@/components/ui/floating-card";

interface ModuleTopBarProps {
  subPages: SubPage[];
  rightSlot?: React.ReactNode;
}

function isSubPageActive(pathname: string, subPage: SubPage): boolean {
  if (pathname === subPage.href) return true;
  return pathname.startsWith(`${subPage.href}/`);
}

export function ModuleTopBar({ subPages, rightSlot }: ModuleTopBarProps) {
  const pathname = usePathname();

  return (
    <div className="sticky top-14 z-30 px-4 pb-3 pt-4 sm:px-6 lg:top-0">
      <FloatingCard
        as="nav"
        aria-label="Module navigation"
        className="mx-auto max-w-7xl border-border bg-card/95 px-3 py-2 shadow-xl shadow-black/10 dark:shadow-black/40 backdrop-blur-xl sm:px-4"
      >
        <div className="flex min-h-11 flex-wrap items-center gap-1">
          {subPages.map((page) => {
            const active = isSubPageActive(pathname, page);

            return (
              <Link
                key={page.href}
                href={page.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "focus-ring rounded-md px-3 py-1.5",
                  "text-sm font-medium",
                  "transition-colors duration-150",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                )}
              >
                {page.label}
              </Link>
            );
          })}
          {rightSlot && (
            <>
              <div className="ml-auto" />
              <div className="mx-1.5 hidden h-4 w-px bg-border/80 sm:block" />
              {rightSlot}
            </>
          )}
        </div>
      </FloatingCard>
    </div>
  );
}
