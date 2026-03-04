import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface AvatarOptionProps {
  name: string;
  avatar: string | null;
  role?: string | null;
  className?: string;
  compact?: boolean;
}

export function AvatarOption({
  name,
  avatar,
  role = null,
  className,
  compact = false,
}: AvatarOptionProps) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <Avatar
        src={avatar}
        name={name}
        alt={`${name} avatar`}
        decorative
        className={compact ? "size-4 text-[9px]" : undefined}
      />
      <span className="truncate">{name}</span>
      {!compact && role ? <span className="truncate text-muted-foreground">{`\u00B7 ${role}`}</span> : null}
    </span>
  );
}
