import { DownloadSimple, FolderOpen, Package } from '@phosphor-icons/react';
import { invoke } from '@tauri-apps/api/core';
import { useMemo, useState } from 'react';
import DownloadCard from '@/components/download-card';
import ErrorBoundary from '@/components/error-boundary';
import PageTitle from '@/components/page-title';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePersistedStore } from '@/lib/store';
import { ModStatus } from '@/types/mods';

// Helper function to safely get a timestamp from downloadedAt which could be a Date, string, or undefined
const getDownloadTimestamp = (
  downloadedAt: Date | string | undefined
): number => {
  if (!downloadedAt) {
    return 0;
  }

  // If it's a Date object
  if (downloadedAt instanceof Date) {
    return downloadedAt.getTime();
  }

  // If it's an ISO string
  if (typeof downloadedAt === 'string') {
    return new Date(downloadedAt).getTime();
  }

  return 0;
};

const Downloads = () => {
  const downloads = usePersistedStore((state) => state.mods);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');

  const filteredDownloads = useMemo(() => {
    if (filter === 'all') {
      return downloads;
    }
    if (filter === 'active') {
      return downloads.filter((d) => d.status === ModStatus.DOWNLOADING);
    }
    return downloads.filter((d) => d.status !== ModStatus.DOWNLOADING);
  }, [downloads, filter]);

  // Sort downloads: in-progress first, then by downloadedAt date desc
  const sortedDownloads = useMemo(() => {
    return [...filteredDownloads].sort((a, b) => {
      // If one is in progress and other isn't, in-progress goes first
      if (
        a.status === ModStatus.DOWNLOADING &&
        b.status !== ModStatus.DOWNLOADING
      ) {
        return -1;
      }
      if (
        b.status === ModStatus.DOWNLOADING &&
        a.status !== ModStatus.DOWNLOADING
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
    () => downloads.filter((d) => d.status === ModStatus.DOWNLOADING).length,
    [downloads]
  );

  const completedCount = useMemo(
    () => downloads.filter((d) => d.status !== ModStatus.DOWNLOADING).length,
    [downloads]
  );

  const downloadFolder = useMemo(() => {
    // Get the path of the first completed download
    const completed = downloads.find(
      (d) => d.status !== ModStatus.DOWNLOADING && d.path
    );
    return completed?.path?.split('\\').slice(0, -1).join('\\') || null;
  }, [downloads]);

  const handleOpenFolder = () => {
    if (downloadFolder) {
      invoke('show_in_folder', { path: downloadFolder });
    }
  };

  return (
    <div className="scrollbar-thumb-primary scrollbar-track-secondary scrollbar-thin h-[calc(100vh-160px)] w-full overflow-y-auto px-4">
      <div className="mb-6 flex items-center justify-between">
        <PageTitle title="Downloads" />
        <Tabs
          className="w-auto"
          defaultValue="all"
          onValueChange={(value) =>
            setFilter(value as 'all' | 'active' | 'completed')
          }
          value={filter}
        >
          <TabsList>
            <TabsTrigger value="all">All ({downloads.length})</TabsTrigger>
            <TabsTrigger value="active">
              <DownloadSimple className="mr-1" />
              Active ({activeCount})
            </TabsTrigger>
            <TabsTrigger value="completed">
              <Package className="mr-1" />
              Completed ({completedCount})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {downloads.length > 0 && downloadFolder && (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <Button onClick={handleOpenFolder} size="sm" variant="outline">
              <FolderOpen className="mr-1 h-4 w-4" />
              Open Download Folder
            </Button>
          </div>
          <Separator className="mb-4" />
        </>
      )}

      <ErrorBoundary>
        {sortedDownloads.length > 0 ? (
          <div className="grid grid-cols-1 gap-4">
            {sortedDownloads.map((download) => (
              <DownloadCard download={download} key={download.id} />
            ))}
          </div>
        ) : (
          <div className="flex h-[calc(100vh-300px)] flex-col items-center justify-center text-muted-foreground">
            <Package className="mb-4 h-16 w-16" />
            <h3 className="mb-2 font-medium text-xl">No downloads found</h3>
            <p className="mb-4">
              There are no downloads matching your current filter.
            </p>
            {filter !== 'all' && (
              <Button onClick={() => setFilter('all')} variant="outline">
                View all downloads
              </Button>
            )}
          </div>
        )}
      </ErrorBoundary>
    </div>
  );
};

export default Downloads;
