import DownloadCard from '@/components/download-card';
import ErrorBoundary from '@/components/error-boundary';
import PageTitle from '@/components/page-title';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePersistedStore } from '@/lib/store';
import { ModStatus } from '@/types/mods';
import { DownloadSimple, FolderOpen, Package } from '@phosphor-icons/react';
import { invoke } from '@tauri-apps/api/core';
import { useMemo, useState } from 'react';

// Helper function to safely get a timestamp from downloadedAt which could be a Date, string, or undefined
const getDownloadTimestamp = (downloadedAt: Date | string | undefined): number => {
  if (!downloadedAt) return 0;
  
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
    if (filter === 'all') return downloads;
    if (filter === 'active') return downloads.filter(d => d.status === ModStatus.DOWNLOADING);
    return downloads.filter(d => d.status !== ModStatus.DOWNLOADING);
  }, [downloads, filter]);

  // Sort downloads: in-progress first, then by downloadedAt date desc
  const sortedDownloads = useMemo(() => {
    return [...filteredDownloads].sort((a, b) => {
      // If one is in progress and other isn't, in-progress goes first
      if (a.status === ModStatus.DOWNLOADING && b.status !== ModStatus.DOWNLOADING) return -1;
      if (b.status === ModStatus.DOWNLOADING && a.status !== ModStatus.DOWNLOADING) return 1;

      // Otherwise sort by downloadedAt date desc, handling both Date and string formats
      return getDownloadTimestamp(b.downloadedAt) - getDownloadTimestamp(a.downloadedAt);
    });
  }, [filteredDownloads]);

  const activeCount = useMemo(() => 
    downloads.filter(d => d.status === ModStatus.DOWNLOADING).length, 
    [downloads]
  );
  
  const completedCount = useMemo(() => 
    downloads.filter(d => d.status !== ModStatus.DOWNLOADING).length, 
    [downloads]
  );
  
  const downloadFolder = useMemo(() => {
    // Get the path of the first completed download
    const completed = downloads.find(d => d.status !== ModStatus.DOWNLOADING && d.path);
    return completed?.path?.split('\\').slice(0, -1).join('\\') || null;
  }, [downloads]);
  
  const handleOpenFolder = () => {
    if (downloadFolder) {
      invoke('show_in_folder', { path: downloadFolder });
    }
  };

  return (
    <div className="h-[calc(100vh-160px)] overflow-y-auto px-4 w-full scrollbar-thumb-primary scrollbar-track-secondary scrollbar-thin">
      <div className="flex items-center justify-between mb-6">
        <PageTitle title="Downloads" />
        <Tabs defaultValue="all" className="w-auto" onValueChange={(value) => setFilter(value as 'all' | 'active' | 'completed')} value={filter}>
          <TabsList>
            <TabsTrigger value="all">
              All ({downloads.length})
            </TabsTrigger>
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
          <div className="flex flex-wrap gap-2 mb-4">
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleOpenFolder}
            >
              <FolderOpen className="w-4 h-4 mr-1" />
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
              <DownloadCard key={download.id} download={download} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-[calc(100vh-300px)] text-muted-foreground">
            <Package className="w-16 h-16 mb-4" />
            <h3 className="text-xl font-medium mb-2">No downloads found</h3>
            <p className="mb-4">There are no downloads matching your current filter.</p>
            {filter !== 'all' && (
              <Button variant="outline" onClick={() => setFilter('all')}>
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
