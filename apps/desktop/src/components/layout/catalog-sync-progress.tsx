import { Button } from "@deadlock-mods/ui/components/button";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { NetworkDiagnosticsButton } from "@/components/shared/network-diagnostics-dialog";
import {
  useCatalogSyncMutation,
  useCatalogSyncState,
} from "@/hooks/use-gamebanana-catalog-sync";

// Each refresh refetches every loaded store page and the dashboard queries;
// the sync's own completion triggers a final refresh (see the sync mutation).
const LIST_REFRESH_INTERVAL_MS = 10_000;

export const CatalogSyncProgress = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const retry = useCatalogSyncMutation(true);
  const { status, syncing, catalog } = useCatalogSyncState();
  const percentage = catalog.data?.syncPercentage;
  const lastListRefreshRef = useRef(0);

  useEffect(() => {
    if (!syncing || !catalog.dataUpdatedAt) return;
    if (
      catalog.dataUpdatedAt - lastListRefreshRef.current <
      LIST_REFRESH_INTERVAL_MS
    ) {
      return;
    }
    lastListRefreshRef.current = catalog.dataUpdatedAt;
    void queryClient.invalidateQueries({ queryKey: ["mods"] });
  }, [syncing, catalog.dataUpdatedAt, queryClient]);

  // Routine background syncs only show in the bottom bar; the banner is for the
  // first crawl, when the catalog is still filling in.
  const firstSync = syncing && catalog.data?.lastFullSyncAt === null;
  if (!firstSync && status !== "error") return null;

  return (
    <div className='shrink-0 space-y-2 border-b bg-muted/50 px-4 py-3'>
      <div className='flex items-center justify-between gap-3'>
        <div role='status' className='text-sm'>
          <p className='font-medium'>
            {t(syncing ? "mods.catalogSyncTitle" : "mods.catalogSyncFailed")}
          </p>
          <p className='text-xs text-muted-foreground'>
            {t(
              syncing ? "mods.catalogSyncDetails" : "mods.catalogSyncRetryHint",
            )}
          </p>
        </div>
        {syncing ? (
          <span className='shrink-0 text-xs tabular-nums text-muted-foreground'>
            {percentage != null && (
              <span className='mr-3 font-medium text-foreground'>
                {t("mods.catalogSyncPercentage", { percentage })}
              </span>
            )}
            {catalog.data &&
              t("mods.catalogSyncCount", { count: catalog.data.count })}
          </span>
        ) : (
          <div className='flex shrink-0 gap-2'>
            <NetworkDiagnosticsButton size='sm' variant='ghost' />
            <Button
              size='sm'
              variant='outline'
              onClick={() => retry.mutate(false)}>
              {t("common.retry")}
            </Button>
          </div>
        )}
      </div>
      {syncing && (
        <div
          role='progressbar'
          aria-label={t("mods.catalogSyncTitle")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percentage ?? undefined}
          className='h-1.5 overflow-hidden rounded-full bg-primary/20'>
          <div
            className={
              percentage == null
                ? "h-full w-full bg-primary/60 motion-safe:animate-pulse"
                : "h-full bg-primary transition-[width] motion-reduce:transition-none"
            }
            style={percentage == null ? undefined : { width: `${percentage}%` }}
          />
        </div>
      )}
    </div>
  );
};
