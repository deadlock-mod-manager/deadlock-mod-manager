import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatSize } from '@/lib/utils';
import type { ModDownloadItem } from '@/types/mods';

interface ModFilesProps {
  files: ModDownloadItem[];
  isDownloadable?: boolean;
}

export const ModFiles = ({ files, isDownloadable = false }: ModFilesProps) => {
  if (!isDownloadable) {
    return null;
  }

  if (!files || files.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">Files</CardTitle>
        <CardDescription>
          Files that can be installed.{' '}
          {files.length > 1
            ? 'Different versions of the mod are available.'
            : ''}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="list-disc space-y-2">
          {files
            .sort((a, b) => b.size - a.size)
            .map((file) => (
              <li
                className="flex items-center justify-between text-sm"
                key={file.name}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="truncate" title={file.name}>
                    {file.name}
                  </span>
                </div>
                <span className="ml-2 text-muted-foreground text-xs">
                  {formatSize(file.size)}
                </span>
              </li>
            ))}
        </ul>
      </CardContent>
    </Card>
  );
};
