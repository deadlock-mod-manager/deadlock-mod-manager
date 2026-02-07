import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import { formatSize } from "@/lib/utils";
import type { ModDownloadItem } from "@/types/mods";
import { DateDisplay } from "../date-display";

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
        <CardTitle className='flex items-center gap-2'>Files</CardTitle>
        <CardDescription>
          Files that can be installed.{" "}
          {files.length > 1
            ? "Different versions of the mod are available."
            : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className='list-disc space-y-2'>
          {files
            .sort((a, b) => b.size - a.size)
            .map((file) => (
              <li
                className='flex items-center justify-between text-sm'
                key={file.name}>
                <div className='flex min-w-0 flex-1 items-center gap-2'>
                  <span className='truncate ' title={file.name}>
                    {file.name}{" "}
                    <DateDisplay
                      date={file.createdAt}
                      prefix='added'
                      className='text-xs text-muted-foreground'
                    />
                  </span>
                </div>
                <span className='ml-2 text-muted-foreground text-xs'>
                  {formatSize(file.size)}
                  {file.md5Checksum ? ` (MD5: ${file.md5Checksum})` : ""}
                </span>
              </li>
            ))}
        </ul>
      </CardContent>
    </Card>
  );
};
