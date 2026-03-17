"use client";

import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "./theme-provider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Toggle theme"
      className={cn(
        "focus-ring flex h-7 w-7 items-center justify-center rounded-lg",
        "text-muted-foreground hover:text-foreground",
        "hover:bg-foreground/[0.04]",
        "transition-colors duration-150",
      )}
    >
      {/* Render both icons; CSS hides the inactive one to avoid hydration mismatch.
          Server always renders "dark" so Sun is visible, Moon is hidden.
          The inline head script + useSyncExternalStore correct this before paint. */}
      <Sun aria-hidden="true" className={cn("h-3.5 w-3.5", theme !== "dark" && "hidden")} />
      <Moon aria-hidden="true" className={cn("h-3.5 w-3.5", theme === "dark" && "hidden")} />
    </button>
  );
}
