import { Button } from "@deadlock-mods/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import { Separator } from "@deadlock-mods/ui/components/separator";
import { Tabs, TabsList, TabsTrigger } from "@deadlock-mods/ui/components/tabs";
import { DownloadSimple, FolderOpen, Package } from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
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

  // If it's a Date object
  if (downloadedAt instanceof Date) {
    return downloadedAt.getTime();
  }

  // If it's an ISO string
  if (typeof downloadedAt === "string") {
    return new Date(downloadedAt).getTime();
  }

  return 0;
};

const Downloads = () => {
  const { t } = useTranslation();
  const downloads = usePersistedStore((state) => state.localMods);
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");

  const filteredDownloads = useMemo(() => {
    if (filter === "all") {
      return downloads;
    }
    if (filter === "active") {
      return downloads.filter((d) => d.status === ModStatus.Downloading);
    }
    return downloads.filter((d) => d.status !== ModStatus.Downloading);
  }, [downloads, filter]);

  // Sort downloads: in-progress first, then by downloadedAt date desc
  const sortedDownloads = useMemo(() => {
    return [...filteredDownloads].sort((a, b) => {
      // If one is in progress and other isn't, in-progress goes first
      if (
        a.status === ModStatus.Downloading &&
        b.status !== ModStatus.Downloading
      ) {
        return -1;
      }
      if (
        b.status === ModStatus.Downloading &&
        a.status !== ModStatus.Downloading
      ) {
        return 1;
      }

      // Otherwise sort by downloadedAt date desc, handling both Date and string formats
      return (
        getDownloadTimestamp(b.downloadedAt) -
        getDownloadTimestamp(a.downloadedAt)
      );
    });
  }, [filteredDownloads]);

  const activeCount = useMemo(
    () => downloads.filter((d) => d.status === ModStatus.Downloading).length,
    [downloads],
  );

  const completedCount = useMemo(
    () => downloads.filter((d) => d.status !== ModStatus.Downloading).length,
    [downloads],
  );

  const downloadFolder = useMemo(() => {
    // Get the path of the first completed download
    const completed = downloads.find(
      (d) => d.status !== ModStatus.Downloading && d.path,
    );
    return completed?.path?.split("\\").slice(0, -1).join("\\") || null;
  }, [downloads]);

  const handleOpenFolder = () => {
    if (downloadFolder) {
      invoke("show_in_folder", { path: downloadFolder });
    }
  };

  return (
    <div className='scrollbar-thumb-primary scrollbar-track-secondary scrollbar-thin w-full overflow-y-auto pl-4 pr-2'>
      <div className='mb-6 flex items-center justify-between'>
        <PageTitle title={t("downloads.title")} />
        <Tabs
          className='w-auto'
          defaultValue='all'
          onValueChange={(value) =>
            setFilter(value as "all" | "active" | "completed")
          }
          value={filter}>
          <TabsList>
            <TabsTrigger value='all'>
              {t("downloads.all")} ({downloads.length})
            </TabsTrigger>
            <TabsTrigger value='active'>
              <DownloadSimple className='mr-1' />
              {t("downloads.active")} ({activeCount})
            </TabsTrigger>
            <TabsTrigger value='completed'>
              <Package className='mr-1' />
              {t("downloads.completed")} ({completedCount})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {downloads.length > 0 && downloadFolder && (
        <>
          <div className='mb-4 flex flex-wrap gap-2'>
            <Button onClick={handleOpenFolder} size='sm' variant='outline'>
              <FolderOpen className='mr-1 h-4 w-4' />
              {t("downloads.openDownloadFolder")}
            </Button>
          </div>
          <Separator className='mb-4' />
        </>
      )}

      <ErrorBoundary>
        {sortedDownloads.length > 0 ? (
          <div className='grid grid-cols-1 gap-4'>
            {sortedDownloads.map((download) => (
              <DownloadCard download={download} key={download.id} />
            ))}
          </div>
        ) : (
          <Empty className='h-[calc(100vh-300px)]'>
            <EmptyHeader>
              <EmptyMedia variant='default'>
                <Package className='h-16 w-16' />
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
