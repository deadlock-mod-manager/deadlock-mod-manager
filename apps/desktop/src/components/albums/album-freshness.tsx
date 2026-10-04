import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { AlertTriangle } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import type { AlbumFreshness } from "@/lib/deadlockskins/album-freshness";
import { cn } from "@/lib/utils";

export const AlbumFreshnessIndicator = ({
  freshness: { status, outdated, total },
  className,
}: {
  freshness: AlbumFreshness;
  className?: string;
}) => {
  const { t } = useTranslation();

  if (status === "current") return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex cursor-help items-center gap-1 text-xs",
            className,
          )}>
          <AlertTriangle
            className={cn(
              "h-3 w-3 shrink-0",
              status === "outdated" ? "text-destructive" : "text-amber-500",
            )}
          />
          {status === "outdated"
            ? t("albums.freshness.outdatedLabel")
            : t("albums.freshness.partialLabel", { count: outdated })}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p className='max-w-xs'>
          {status === "outdated"
            ? t("albums.freshness.outdatedDescription")
            : t("albums.freshness.partialDescription", {
                count: outdated,
                total,
              })}
        </p>
      </TooltipContent>
    </Tooltip>
  );
};
