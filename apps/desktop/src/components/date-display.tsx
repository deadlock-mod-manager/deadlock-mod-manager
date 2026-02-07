import { format, formatDistanceToNow } from "date-fns";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { cn } from "@deadlock-mods/ui/lib/utils";

export const DateDisplay = ({
  date,
  prefix,
  inverse = false,
  dateFormat = "dd-MM-yyyy HH:mm",
  className,
}: {
  date: Date | undefined | null;
  prefix?: string;
  inverse?: boolean;
  dateFormat?: string;
  className?: string;
}) => {
  if (!date) {
    return null;
  }
  const exact = format(date, dateFormat);
  const distance = `${prefix ? `${prefix} ` : ""}${formatDistanceToNow(date)} ago`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("cursor-pointer", className)}>
          {inverse ? (prefix ? `${prefix} at ${exact}` : exact) : distance}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <span className={cn("text-muted-foreground text-xs", className)}>
          {inverse
            ? distance
            : prefix
              ? `${prefix} at ${exact}`
              : `at ${exact}`}
        </span>
      </TooltipContent>
    </Tooltip>
  );
};
