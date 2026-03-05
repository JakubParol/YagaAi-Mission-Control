import * as React from "react";

import { cn } from "@/lib/utils";

export const FLOATING_CARD_SURFACE_CLASS =
  "rounded-lg border border-border bg-card/50 shadow-sm";

type FloatingCardProps<T extends React.ElementType> = {
  as?: T;
  className?: string;
} & Omit<React.ComponentPropsWithoutRef<T>, "as" | "className">;

export function FloatingCard<T extends React.ElementType = "div">({
  as,
  className,
  ...props
}: FloatingCardProps<T>) {
  const Component = (as ?? "div") as React.ElementType;

  return (
    <Component
      className={cn(FLOATING_CARD_SURFACE_CLASS, className)}
      {...props}
    />
  );
}
