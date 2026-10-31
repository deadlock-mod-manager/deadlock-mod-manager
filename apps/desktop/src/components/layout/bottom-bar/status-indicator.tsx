import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export function StatusIndicator({
  icon: Icon,
  tooltip,
  className,
}: {
  icon: PhosphorIcon;
  tooltip: string;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className='flex cursor-default items-center justify-center p-0.5'>
          <Icon className={cn("h-3.5 w-3.5", className)} />
        </div>
      </TooltipTrigger>
      <TooltipContent side='top' sideOffset={8}>
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}
