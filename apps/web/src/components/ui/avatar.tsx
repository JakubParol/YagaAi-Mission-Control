"use client";

import * as React from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";

export function buildAvatarFallbackText(name: string | null | undefined): string {
  const normalized = name?.trim();
  if (!normalized) return "?";
  const first = normalized[0];
  return first ? first.toUpperCase() : "?";
}

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  alt?: string;
  decorative?: boolean;
  className?: string;
}

export function Avatar({ src, name, alt, decorative = false, className }: AvatarProps) {
  const normalizedSrc = src?.trim() ? src.trim() : null;
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
  }, [normalizedSrc]);

  const fallbackText = buildAvatarFallbackText(name);
  const fallbackLabel = alt?.trim() || name?.trim() || "Avatar";
  const showImage = Boolean(normalizedSrc && !failed);

  return (
    <span
      className={cn(
        "relative inline-flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/70 bg-muted text-[10px] font-semibold text-muted-foreground",
        className,
      )}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : fallbackLabel}
      aria-hidden={decorative ? true : undefined}
    >
      {showImage ? (
        <Image
          src={normalizedSrc!}
          alt={decorative ? "" : fallbackLabel}
          fill
          unoptimized
          sizes="20px"
          className="object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden="true">{fallbackText}</span>
      )}
    </span>
  );
}
