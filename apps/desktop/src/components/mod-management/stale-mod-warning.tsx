import { Alert, AlertDescription } from "@deadlock-mods/ui/components/alert";
import { Badge } from "@deadlock-mods/ui/components/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { AlertTriangle } from "@deadlock-mods/ui/icons";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";

type StaleModWarningProps = {
  variant?: "indicator" | "alert";
  className?: string;
  openReportCount: number;
  lastUpdatedAt: Date;
};

export const StaleModWarning = ({
  variant = "indicator",
  className,
  openReportCount,
  lastUpdatedAt,
}: StaleModWarningProps) => {
  const { t } = useTranslation();
  const formattedDate = format(lastUpdatedAt, "PP");
  const warningText = t("warnings.staleModDescription", {
    count: openReportCount,
    date: formattedDate,
  });

  if (variant === "alert") {
    return (
      <Alert className={className} variant='warning'>
        <AlertTriangle className='h-4 w-4' />
        <AlertDescription>{warningText}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge className={`cursor-help ${className}`} variant='secondary'>
          <AlertTriangle className='mr-1 h-3 w-3' />
          {t("warnings.staleModLabel")}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p className='max-w-xs'>{warningText}</p>
      </TooltipContent>
    </Tooltip>
  );
};
