import { Button } from "@deadlock-mods/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { cn } from "@deadlock-mods/ui/lib/utils";

export const RailButton = ({
  label,
  className,
  ...props
}: React.ComponentProps<typeof Button> & { label: string }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        size='icon'
        variant='ghost'
        aria-label={label}
        className={cn(
          "size-8 text-muted-foreground hover:text-foreground",
          className,
        )}
        {...props}
      />
    </TooltipTrigger>
    <TooltipContent side='left'>{label}</TooltipContent>
  </Tooltip>
);
