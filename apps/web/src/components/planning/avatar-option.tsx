import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface AvatarOptionProps {
  name: string;
  lastName?: string | null;
  initials?: string | null;
  avatar: string | null;
  role?: string | null;
  className?: string;
  compact?: boolean;
}

export function AvatarOption({
  name,
  lastName = null,
  initials = null,
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
        lastName={lastName}
        initials={initials}
        alt={`${name} avatar`}
        decorative
        className={compact ? "size-4 text-[9px]" : undefined}
      />
      <span className="truncate">{name}</span>
      {!compact && role ? <span className="truncate text-muted-foreground">{`\u00B7 ${role}`}</span> : null}
    </span>
  );
}
