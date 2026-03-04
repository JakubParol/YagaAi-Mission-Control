import { Avatar } from "@/components/ui/avatar";

export function AssigneeAvatarTooltip({
  name,
  lastName = null,
  initials = null,
  avatar = null,
}: {
  name: string;
  lastName?: string | null;
  initials?: string | null;
  avatar?: string | null;
}) {
  return (
    <span className="relative inline-flex items-center">
      <Avatar
        src={avatar}
        name={name}
        lastName={lastName}
        initials={initials}
        alt={`${name} assignee avatar`}
        decorative
        className="size-5 text-[9px]"
      />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-[calc(100%+0.45rem)] z-50 -translate-x-1/2 whitespace-nowrap rounded-md border border-border/70 bg-popover px-2 py-1 text-[10px] font-medium text-popover-foreground opacity-0 shadow-md transition-opacity duration-150 group-hover/assignee:opacity-100 group-focus-visible/assignee:opacity-100"
      >
        {name}
      </span>
    </span>
  );
}
