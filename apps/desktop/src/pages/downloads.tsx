import DownloadCard from '@/components/download-card';
import ErrorBoundary from '@/components/error-boundary';
import PageTitle from '@/components/page-title';
import { usePersistedStore } from '@/lib/store';
import { ModStatus } from '@/types/mods';

const Downloads = () => {
  const downloads = usePersistedStore((state) => state.mods);

  // Sort downloads: in-progress first, then by downloadedAt date desc
  const sortedDownloads = [...downloads].sort((a, b) => {
    // If one is in progress and other isn't, in-progress goes first
    if (a.status === ModStatus.DOWNLOADING && b.status !== ModStatus.DOWNLOADING) return -1;
    if (b.status === ModStatus.DOWNLOADING && a.status !== ModStatus.DOWNLOADING) return 1;

    // Otherwise sort by downloadedAt date desc
    return (b.downloadedAt?.getTime() ?? 0) - (a.downloadedAt?.getTime() ?? 0);
  });

  return (
    <div className="h-[calc(100vh-160px)] overflow-y-auto px-4 w-full scrollbar-thumb-primary scrollbar-track-secondary scrollbar-thin">
      <PageTitle className="mb-8" title="Downloads" />
      <ErrorBoundary>
        <div className="grid grid-cols-1 gap-4">
          {sortedDownloads.map((download) => (
            <DownloadCard key={download.id} download={download} />
          ))}
        </div>
      </ErrorBoundary>
    </div>
  );
};

export default Downloads;
