'use client';

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConnectionStatus } from "./connection-status";
import { navModules, isModuleActive } from "@/lib/navigation";

const DRAWER_ID = "mobile-nav-drawer";

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    triggerRef.current?.focus();
  }, []);

  const handleOpen = useCallback(() => {
    setIsOpen(true);
  }, []);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        handleClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, handleClose]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (!isOpen) return;

    const scrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";

    return () => {
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);

  // Move focus into drawer when opened
  useEffect(() => {
    if (isOpen) {
      closeButtonRef.current?.focus();
    }
  }, [isOpen]);

  return (
    <>
      {/* Hamburger button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        className={cn(
          "focus-ring flex h-9 w-9 items-center justify-center rounded-lg",
          "text-muted-foreground hover:text-foreground",
          "hover:bg-white/[0.04]",
          "transition-colors duration-150 lg:hidden"
        )}
        aria-label="Open navigation menu"
        aria-expanded={isOpen}
        aria-controls={DRAWER_ID}
      >
        <Menu aria-hidden="true" className="h-5 w-5" />
      </button>

      {/* Portal drawer */}
      {isOpen && mounted && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm lg:hidden"
            onClick={handleClose}
            role="presentation"
          />

          {/* Drawer */}
          <nav
            id={DRAWER_ID}
            className={cn(
              "fixed inset-y-4 left-4 z-[9999] w-72 lg:hidden",
              "bg-card",
              "border border-white/[0.08]",
              "shadow-2xl",
              "rounded-xl",
              "flex flex-col gap-6 overflow-hidden p-6"
            )}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <Link
                href="/"
                onClick={handleClose}
                className="focus-ring group flex items-center gap-2.5 rounded-lg"
              >
                <div
                  aria-hidden="true"
                  className="h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_8px_rgba(236,133,34,0.4)] transition-shadow duration-300 group-hover:shadow-[0_0_12px_rgba(236,133,34,0.6)]"
                />
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground">
                  Mission Control
                </span>
              </Link>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={handleClose}
                className={cn(
                  "focus-ring flex h-8 w-8 items-center justify-center rounded-lg",
                  "text-muted-foreground hover:text-foreground",
                  "hover:bg-white/[0.04]",
                  "transition-colors duration-150"
                )}
                aria-label="Close navigation menu"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>

            {/* Nav links */}
            <div className="flex-1 space-y-1 overflow-y-auto">
              {navModules.map((mod) => {
                const active = isModuleActive(pathname, mod);
                const Icon = mod.icon;

                return (
                  <Link
                    key={mod.href}
                    href={mod.subPages?.[0]?.href ?? mod.href}
                    onClick={handleClose}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "focus-ring flex items-center gap-3 rounded-lg px-3 py-2.5",
                      "text-sm font-medium",
                      "transition-colors duration-150",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                    )}
                  >
                    <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                    {mod.label}
                  </Link>
                );
              })}
            </div>

            {/* Connection Status */}
            <div className="shrink-0 border-t border-white/5 pt-4">
              <ConnectionStatus />
            </div>
          </nav>
        </>,
        document.body
      )}
    </>
  );
}
