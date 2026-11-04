import { usePerfConfigList } from "@/hooks/performance/use-perf-config-list";
import { getErrorMessage } from "@/lib/errors";
import { tierForScore } from "@/lib/performance/scale";
import { Button } from "@deadlock-mods/ui/components/button";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { useTranslation } from "react-i18next";
import { ActiveStrip } from "./active-strip";
import { EmptyStrip } from "./empty-strip";
import { ForeignOverlayNotices } from "./foreign-overlay-notices";
import { GameMissingStrip } from "./game-missing-strip";
import { Notice } from "./notice";
import { OrphanedOverlayNotice } from "./orphaned-overlay-notice";
import { SyncNotice } from "./sync-notice";
import { UnmanagedChangesNotice } from "./unmanaged-changes-notice";

/** What the file holds versus what the user chose, with the fixes for any gap. */
export const ActiveConfigStatus = () => {
  const { t } = useTranslation();
  const { statusQuery, desired, items, activeItem, activeCutScore } =
    usePerfConfigList();

  if (statusQuery.isPending) {
    return <Skeleton className='h-16 w-full rounded-lg' />;
  }

  if (statusQuery.isError) {
    return (
      <Notice
        action={
          <Button
            isLoading={statusQuery.isRefetching}
            onClick={() => statusQuery.refetch()}
            size='sm'
            variant='outline'>
            {t("performance.configs.retry")}
          </Button>
        }>
        {t("performance.activeStatus.error", {
          message: getErrorMessage(statusQuery.error),
        })}
      </Notice>
    );
  }

  const status = statusQuery.data;
  if (!status.gamePathSet) return <GameMissingStrip reason='path' />;
  if (!status.gameinfoFound) return <GameMissingStrip reason='gameinfo' />;
  if (!desired && status.applied) {
    const { configId } = status.applied;
    return (
      <OrphanedOverlayNotice
        name={
          items.find((item) => item.configId === configId)?.name ?? configId
        }
      />
    );
  }
  if (!desired) {
    return (
      <div className='flex flex-col gap-3'>
        <EmptyStrip foreign={status.foreign} />
        <UnmanagedChangesNotice count={status.unmanagedChanges} />
      </div>
    );
  }

  const tier =
    activeItem?.tier ??
    (activeCutScore === null ? null : tierForScore(activeCutScore).id);

  return (
    <div className='flex flex-col gap-3'>
      <ActiveStrip
        desired={desired}
        name={activeItem?.name ?? desired.request.name}
        status={status}
        tier={tier}
      />
      <SyncNotice desired={desired} status={status} />
      <ForeignOverlayNotices desired={desired} foreign={status.foreign} />
      <UnmanagedChangesNotice count={status.unmanagedChanges} />
    </div>
  );
};
export { CatalogBehindNotice } from "./catalog-behind-notice";
