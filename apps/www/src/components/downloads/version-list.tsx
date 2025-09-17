import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { Release } from '@/types/releases';

interface VersionListProps {
  versions: Release[];
  selectedVersion: string;
  onVersionSelect: (version: string) => void;
}

export const VersionList = ({
  versions,
  selectedVersion,
  onVersionSelect,
}: VersionListProps) => (
  <Card>
    <CardHeader>
      <CardTitle>All Versions</CardTitle>
      <CardDescription>Browse and download previous releases</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="grid gap-3">
        {versions.slice(0, 10).map((release) => (
          <div
            className="flex items-center justify-between rounded-lg border p-3"
            key={release.version}
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">Version {release.version}</span>
                {release.prerelease && (
                  <Badge className="text-xs" variant="secondary">
                    Pre-release
                  </Badge>
                )}
              </div>
              <div className="text-muted-foreground text-sm">
                Released {new Date(release.publishedAt).toLocaleDateString()} •
                {release.downloads.length} download
                {release.downloads.length !== 1 ? 's' : ''} available
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-sm">
                {release.downloads.reduce(
                  (acc, download) => acc + download.downloadCount,
                  0
                )}{' '}
                total downloads
              </span>
              <Button
                disabled={selectedVersion === release.version}
                onClick={() => onVersionSelect(release.version)}
                size="sm"
                variant="outline"
              >
                {selectedVersion === release.version ? 'Selected' : 'View'}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
);
