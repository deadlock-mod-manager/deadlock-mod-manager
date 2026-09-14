import { Button } from "@deadlock-mods/ui/components/button";
import {
  useMutationState,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  CATALOG_SYNC_KEY,
  useCatalogSyncMutation,
} from "@/hooks/use-gamebanana-catalog-sync";
import { inspectGameBananaCatalog } from "@/lib/gamebanana-catalog";

export const CatalogSyncProgress = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const retry = useCatalogSyncMutation();
  const states = useMutationState({
    filters: { mutationKey: CATALOG_SYNC_KEY },
    select: (mutation) => mutation.state.status,
  });
  const status = states.at(-1);
  const syncing = status === "pending";
  const catalog = useQuery({
    queryKey: ["gamebanana-catalog-status"],
    queryFn: inspectGameBananaCatalog,
    enabled: syncing,
    refetchInterval: syncing ? 2000 : false,
  });
  const percentage = catalog.data?.syncPercentage;

  useEffect(() => {
    if (syncing && catalog.dataUpdatedAt) {
      void queryClient.invalidateQueries({ queryKey: ["mods"] });
    }
  }, [syncing, catalog.dataUpdatedAt, queryClient]);

  if (!syncing && status !== "error") return null;

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
          <Button
            size='sm'
            variant='outline'
            onClick={() => retry.mutate(false)}>
            {t("common.retry")}
          </Button>
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
