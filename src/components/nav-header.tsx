'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import ConnectionStatus from "./connection-status";

export function NavHeader() {
  const pathname = usePathname();

  const isStories = pathname === "/" || pathname.startsWith("/stories");
  const isBoard = pathname === "/board";

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight hover:text-primary transition-colors"
        >
          Mission Control
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link
            href="/"
            className={
              isStories
                ? "text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground transition-colors"
            }
          >
            Stories
          </Link>
          <Link
            href="/board"
            className={
              isBoard
                ? "text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground transition-colors"
            }
          >
            Board
          </Link>
        </nav>
        <div className="ml-auto">
          <ConnectionStatus />
        </div>
      </div>
    </header>
  );
}
