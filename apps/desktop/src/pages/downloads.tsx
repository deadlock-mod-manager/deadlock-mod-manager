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
import { usePersistedStore } from "@/lib/store";
import { ModStatus } from "@/types/mods";

// Helper function to safely get a timestamp from downloadedAt which could be a Date, string, or undefined
const getDownloadTimestamp = (
  downloadedAt: Date | string | undefined,
): number => {
  if (!downloadedAt) {
    return 0;
  }

  if (downloadedAt instanceof Date) {
    return downloadedAt.getTime();
  }

  if (typeof downloadedAt === "string") {
    return new Date(downloadedAt).getTime();
  }

  return 0;
};

const isDownloadInProgress = (status: ModStatus) =>
  status === ModStatus.Downloading || status === ModStatus.Paused;

const Downloads = () => {
  const { t } = useTranslation();
  const downloads = usePersistedStore((state) => state.localMods);
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");

  const filteredDownloads = useMemo(() => {
    if (filter === "all") {
      return downloads;
    }
    if (filter === "active") {
      return downloads.filter((d) => isDownloadInProgress(d.status));
    }
    return downloads.filter((d) => !isDownloadInProgress(d.status));
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

  const completedCount = useMemo(
    () => downloads.filter((d) => !isDownloadInProgress(d.status)).length,
    [downloads],
  );

  const subtitle = `${activeCount} ${t("downloads.active").toLowerCase()} · ${completedCount} ${t("downloads.completed").toLowerCase()} · ${downloads.length} ${t("downloads.total").toLowerCase()}`;

  return (
    <div className='flex h-full min-h-0 w-full flex-col'>
      <div className='flex shrink-0 items-start justify-between gap-4 px-4 pr-2'>
        <PageTitle subtitle={subtitle} title={t("downloads.title")} />
        <Tabs
          className='w-auto pt-4'
          defaultValue='all'
          onValueChange={(value) =>
            setFilter(value as "all" | "active" | "completed")
          }
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
