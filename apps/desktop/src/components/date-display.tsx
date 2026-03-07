import { format, formatDistanceToNow } from "date-fns";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  if (!date) {
    return null;
  }
  const exact = format(date, dateFormat);
  const prefixWithSpace = prefix ? `${prefix} ` : "";
  const distance = `${prefixWithSpace}${formatDistanceToNow(date)} ${t("time.ago")}`;

  const displayText = prefix ? `${prefix} ${t("time.at")} ${exact}` : exact;

  const tooltipText = prefix
    ? `${prefix} ${t("time.at")} ${exact}`
    : `${t("time.at")} ${exact}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("cursor-pointer", className)}>
          {inverse ? displayText : distance}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <span className={cn("text-muted-foreground text-xs", className)}>
          {inverse ? distance : tooltipText}
        </span>
      </TooltipContent>
    </Tooltip>
  );
};
