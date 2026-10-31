import { Button } from "@deadlock-mods/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import { Tabs, TabsList, TabsTrigger } from "@deadlock-mods/ui/components/tabs";
import { DownloadSimple, Package } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import DownloadCard from "@/components/downloads/download-card";
import ErrorBoundary from "@/components/shared/error-boundary";
import PageTitle from "@/components/shared/page-title";
import { downloadManager } from "@/lib/download/manager";
import { usePersistedStore } from "@/lib/store";
import { ModStatus } from "@/types/mods";
import {
  isDownloadInProgress,
  isDownloadComplete,
  isDownloadFailed,
} from "@/lib/download/status";

// Helper function to safely get a timestamp from downloadedAt which could be a Date, string, or undefined
const getDownloadTimestamp = (
  downloadedAt: Date | string | undefined,
): number => {
  if (!downloadedAt) {
    return 0;
  }

  return downloadedAt instanceof Date
    ? downloadedAt.getTime()
    : new Date(downloadedAt).getTime();
};

const Downloads = () => {
  const { t } = useTranslation();
  const downloads = usePersistedStore((state) => state.localMods);
  const [filter, setFilter] = useState<
    "all" | "active" | "completed" | "failed"
  >("all");

  const filteredDownloads = useMemo(() => {
    if (filter === "all") {
      return downloads;
    }
    if (filter === "active") {
      return downloads.filter((d) => isDownloadInProgress(d.status));
    }
    return downloads.filter((d) =>
      filter === "failed"
        ? isDownloadFailed(d.status)
        : isDownloadComplete(d.status),
    );
  }, [downloads, filter]);

  const sortedDownloads = useMemo(() => {
    return [...filteredDownloads].sort((a, b) => {
      const aActive = isDownloadInProgress(a.status);
      const bActive = isDownloadInProgress(b.status);
      if (aActive && !bActive) {
        return -1;
      }
      if (bActive && !aActive) {
        return 1;
      }

      return (
        getDownloadTimestamp(b.downloadedAt) -
        getDownloadTimestamp(a.downloadedAt)
      );
    });
  }, [filteredDownloads]);

  const activeCount = useMemo(
    () => downloads.filter((d) => isDownloadInProgress(d.status)).length,
    [downloads],
  );

  const waitingCount = usePersistedStore(
    (state) =>
      state.localMods.filter((d) => downloadManager.isWaiting(d)).length,
  );

  const completedCount = useMemo(
    () => downloads.filter((d) => isDownloadComplete(d.status)).length,
    [downloads],
  );

  const failedCount = downloads.filter((d) =>
    isDownloadFailed(d.status),
  ).length;

  const pausedCount = downloads.filter(
    (d) => d.status === ModStatus.Paused,
  ).length;

  // Waiting and paused downloads are counted apart, as in the bottom bar.
  const waiting =
    waitingCount > 0 ? `, ${waitingCount} ${t("common.waiting")}` : "";
  const paused =
    pausedCount > 0 ? `, ${pausedCount} ${t("common.paused")}` : "";
  const subtitle = `${activeCount - waitingCount - pausedCount} ${t("downloads.active").toLowerCase()}${waiting}${paused}, ${completedCount} ${t("downloads.completed").toLowerCase()}, ${failedCount} ${t("downloads.failed").toLowerCase()}, ${downloads.length} ${t("downloads.total").toLowerCase()}`;

  return (
    <div className='flex h-full min-h-0 w-full flex-col'>
      <div className='flex shrink-0 items-start justify-between gap-4 px-4 pr-2'>
        <PageTitle subtitle={subtitle} title={t("downloads.title")} />
        <Tabs
          className='w-auto pt-4'
          defaultValue='all'
          onValueChange={(value) => {
            if (
              value === "all" ||
              value === "active" ||
              value === "completed" ||
              value === "failed"
            )
              setFilter(value);
          }}
          value={filter}>
          <TabsList className='rounded-full bg-muted/60 p-1'>
            <TabsTrigger
              className='rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground'
              value='all'>
              {t("downloads.all")} ({downloads.length})
            </TabsTrigger>
            <TabsTrigger
              className='rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground'
              value='active'>
              <DownloadSimple className='mr-1' />
              {t("downloads.active")} ({activeCount})
            </TabsTrigger>
            <TabsTrigger
              className='rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground'
              value='completed'>
              <Package className='mr-1' />
              {t("downloads.completed")} ({completedCount})
            </TabsTrigger>
            <TabsTrigger
              className='rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground'
              value='failed'>
              {t("downloads.failed")} ({failedCount})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <ErrorBoundary>
        {sortedDownloads.length > 0 ? (
          <div className='min-h-0 flex-1 overflow-y-auto px-4 pr-2 pt-6'>
            <div className='space-y-3 pb-6'>
              {sortedDownloads.map((download) => (
                <DownloadCard download={download} key={download.id} />
              ))}
            </div>
          </div>
        ) : (
          <Empty className='min-h-0 flex-1'>
            <EmptyHeader>
              <EmptyMedia
                className='flex size-16 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20'
                variant='default'>
                <Package className='size-8 text-primary' />
              </EmptyMedia>
              <EmptyTitle>{t("downloads.noDownloadsFound")}</EmptyTitle>
              <EmptyDescription>
                {t("downloads.noDownloadsMatchFilter")}
              </EmptyDescription>
            </EmptyHeader>
            {filter !== "all" && (
              <EmptyContent>
                <Button onClick={() => setFilter("all")} variant='outline'>
                  {t("downloads.viewAllDownloads")}
                </Button>
              </EmptyContent>
            )}
          </Empty>
        )}
      </ErrorBoundary>
    </div>
  );
};

export default Downloads;
