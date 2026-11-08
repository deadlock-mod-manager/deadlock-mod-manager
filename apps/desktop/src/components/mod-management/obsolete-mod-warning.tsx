import { Badge } from "@deadlock-mods/ui/components/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { XCircle } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

type ObsoleteModWarningProps = {
  variant?: "indicator" | "chip";
  className?: string;
};

export const ObsoleteModWarning = ({
  variant = "indicator",
  className,
}: ObsoleteModWarningProps) => {
  const { t } = useTranslation();
  const warningText = t("warnings.obsoleteDescription");

  if (variant === "chip") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border border-foreground/15 bg-foreground/5 px-2 py-0.5 font-medium text-foreground/80 text-xs",
          className,
        )}>
        <XCircle className='size-3' />
        {t("warnings.obsoleteLabel")}
      </span>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge className={cn("cursor-help", className)} variant='destructive'>
          <XCircle className='mr-1 h-3 w-3' />
          {t("warnings.obsoleteLabel")}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p className='max-w-xs'>{warningText}</p>
      </TooltipContent>
    </Tooltip>
  );
};
