import { FileDown, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  formatDownloadCount,
  formatFileSize,
  getPlatformDisplayName,
  getPlatformIcon,
} from '@/lib/os-detection';
import type { PlatformDownload } from '@/types/releases';

interface AllDownloadsProps {
  downloads: PlatformDownload[];
}

export const AllDownloads = ({ downloads }: AllDownloadsProps) => (
  <div>
    <h3 className="mb-4 font-semibold">All downloads</h3>
    <div className="grid gap-3">
      {downloads.map((download) => (
        <div
          className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
          key={`${download.platform}-${download.architecture}-${download.filename}`}
        >
          <div className="flex items-center gap-3">
            <span className="text-lg">
              {getPlatformIcon(download.platform)}
            </span>
            <div>
              <div className="font-medium">
                {getPlatformDisplayName(
                  download.platform,
                  download.architecture
                )}
              </div>
              <div className="text-muted-foreground text-sm">
                {download.filename}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right text-muted-foreground text-sm">
              <div>{formatFileSize(download.size)}</div>
              <div className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {formatDownloadCount(download.downloadCount)} downloads
              </div>
            </div>
            <Button asChild size="sm" variant="outline">
              <a download href={download.url}>
                <FileDown className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </div>
      ))}
    </div>
  </div>
);
