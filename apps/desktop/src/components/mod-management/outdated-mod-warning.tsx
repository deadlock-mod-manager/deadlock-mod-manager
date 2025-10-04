import { Alert, AlertDescription } from "@deadlock-mods/ui/components/alert";
import { Badge } from "@deadlock-mods/ui/components/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { AlertTriangle } from "@deadlock-mods/ui/icons";

type OutdatedModWarningProps = {
  variant?: "indicator" | "alert";
  className?: string;
};

export const OutdatedModWarning = ({
  variant = "indicator",
  className,
}: OutdatedModWarningProps) => {
  const warningText =
    "This mod hasn't been updated since August 19, 2025 and may not work properly";

  if (variant === "alert") {
    return (
      <Alert className={className} variant='destructive'>
        <AlertTriangle className='h-4 w-4' />
        <AlertDescription>{warningText}</AlertDescription>
      </Alert>
    );
  }

  // Indicator variant for cards
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge className={`cursor-help ${className}`} variant='destructive'>
          <AlertTriangle className='mr-1 h-3 w-3' />
          Outdated
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p className='max-w-xs'>{warningText}</p>
      </TooltipContent>
    </Tooltip>
  );
};
