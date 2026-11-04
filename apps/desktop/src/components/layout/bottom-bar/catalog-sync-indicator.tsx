import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { Progress } from "@deadlock-mods/ui/components/progress";
import { DatabaseIcon } from "@phosphor-icons/react";
import { formatDistanceToNow } from "date-fns";
import { useTranslation } from "react-i18next";
import { useCatalogSyncState } from "@/hooks/use-gamebanana-catalog-sync";
import { cn } from "@/lib/utils";

export function CatalogSyncIndicator() {
  const { t } = useTranslation();
  const { status, syncing, catalog } = useCatalogSyncState();
  const data = catalog.data;
  const lastSyncedAt = Math.max(
    data?.lastIncrementalAt ?? 0,
    data?.lastFullSyncAt ?? 0,
  );
  const lastSynced =
    lastSyncedAt > 0
      ? formatDistanceToNow(new Date(lastSyncedAt * 1000), { addSuffix: true })
      : null;

  let className = "text-status-ok";
  let summary = t("mods.catalogIndicatorSynced", { time: lastSynced });
  if (status === "error") {
    className = "text-red-500";
    summary = t("mods.catalogSyncFailed");
  } else if (!lastSynced) {
    className = "text-muted-foreground";
    summary = t("mods.catalogIndicatorNeverSynced");
  } else if (data?.stale) {
    className = "text-yellow-500";
    summary = t("mods.catalogIndicatorStale", { time: lastSynced });
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className='relative flex cursor-default items-center justify-center p-0.5'>
          <DatabaseIcon className={cn("h-3.5 w-3.5", className)} />
          {syncing && (
            <span className='absolute right-0 bottom-0 size-2 rounded-full bg-background p-px'>
              <span className='block size-full animate-spin rounded-full border border-blue-500 border-t-transparent' />
            </span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent
        className='w-56 space-y-1.5 p-2'
        side='top'
        sideOffset={8}>
        <p className='text-xs font-medium'>
          {syncing ? t("mods.catalogSyncTitle") : summary}
        </p>
        {data && (
          <p className='text-xs text-muted-foreground'>
            {t("mods.catalogSyncCount", { count: data.count })}
          </p>
        )}
        {syncing && data?.syncPercentage != null && (
          <Progress className='h-1' value={data.syncPercentage} />
        )}
      </TooltipContent>
    </Tooltip>
  );
}
