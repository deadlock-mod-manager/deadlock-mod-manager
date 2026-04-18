import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { ArrowsClockwiseIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface RefreshButtonProps {
  onClick: () => void;
  isFetching?: boolean;
}

const RefreshButton = ({ onClick, isFetching }: RefreshButtonProps) => {
  const { t } = useTranslation();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={t("servers.filters.refresh")}
          className={cn(
            "inline-flex size-9 items-center justify-center rounded-md",
            "border border-border/60 bg-background/40 text-muted-foreground",
            "transition-colors hover:bg-background/80 hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
          disabled={isFetching}
          onClick={onClick}
          type='button'>
          <ArrowsClockwiseIcon
            className={cn("size-4", isFetching && "animate-spin")}
            weight='bold'
          />
        </button>
      </TooltipTrigger>
      <TooltipContent>{t("servers.filters.refresh")}</TooltipContent>
    </Tooltip>
  );
};

export default RefreshButton;
