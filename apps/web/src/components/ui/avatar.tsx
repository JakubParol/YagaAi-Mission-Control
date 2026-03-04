"use client";

import * as React from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";

function firstDisplayLetter(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  const first = normalized[0];
  return first ? first.toUpperCase() : null;
}

export function buildAvatarFallbackText(
  name: string | null | undefined,
  lastName: string | null | undefined = null,
  initials: string | null | undefined = null,
): string {
  const normalizedInitials = initials?.trim();
  if (normalizedInitials) {
    return normalizedInitials.toUpperCase();
  }

  const firstNameLetter = firstDisplayLetter(name);
  const lastNameLetter = firstDisplayLetter(lastName);
  if (firstNameLetter && lastNameLetter) {
    return `${firstNameLetter}${lastNameLetter}`;
  }

  if (firstNameLetter) {
    return firstNameLetter;
  }

  return "?";
}

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  lastName?: string | null;
  initials?: string | null;
  alt?: string;
  decorative?: boolean;
  className?: string;
}

export function Avatar({
  src,
  name,
  lastName = null,
  initials = null,
  alt,
  decorative = false,
  className,
}: AvatarProps) {
  const normalizedSrc = src?.trim() ? src.trim() : null;
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
  }, [normalizedSrc]);

  const fallbackText = buildAvatarFallbackText(name, lastName, initials);
  const displayName = [name?.trim(), lastName?.trim()].filter(Boolean).join(" ");
  const fallbackLabel = alt?.trim() || displayName || "Avatar";
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
