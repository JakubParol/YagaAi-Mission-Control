import { Avatar } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center">
          <Avatar
            src={avatar}
            name={name}
            lastName={lastName}
            initials={initials}
            alt={`${name} assignee avatar`}
            decorative
            className="size-5 text-[9px]"
          />
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">{name}</TooltipContent>
    </Tooltip>
  );
}
