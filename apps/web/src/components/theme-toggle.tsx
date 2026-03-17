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
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "focus-ring flex h-7 w-7 items-center justify-center rounded-lg",
        "text-muted-foreground hover:text-foreground",
        "hover:bg-foreground/[0.04]",
        "transition-colors duration-150",
      )}
    >
      {theme === "dark" ? (
        <Sun aria-hidden="true" className="h-3.5 w-3.5" />
      ) : (
        <Moon aria-hidden="true" className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
