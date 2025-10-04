import { Badge } from "@deadlock-mods/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import { Separator } from "@deadlock-mods/ui/components/separator";
import { Archive } from "@deadlock-mods/ui/icons";
import { formatSize } from "@/lib/utils";
import type { ModFileTree } from "@/types/mods";

interface InstalledFilesDisplayProps {
  fileTree: ModFileTree;
  modName: string;
}

export const InstalledFilesDisplay = ({
  fileTree,
  modName,
}: InstalledFilesDisplayProps) => {
  const filesByArchive = fileTree.files.reduce(
    (acc, file) => {
      if (!acc[file.archive_name]) {
        acc[file.archive_name] = [];
      }
      acc[file.archive_name].push(file);
      return acc;
    },
    {} as Record<string, typeof fileTree.files>,
  );

  const archiveNames = Object.keys(filesByArchive);

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          Installed Files
        </CardTitle>
        <CardDescription>
          Files from {modName} that were installed to the game.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className='space-y-4'>
          {archiveNames.map((archiveName) => (
            <div className='space-y-2' key={archiveName}>
              <div className='flex items-center gap-2'>
                <Archive className='h-4 w-4 text-muted-foreground' />
                <span className='font-medium text-sm'>{archiveName}</span>
                <Badge className='text-xs' variant='outline'>
                  {filesByArchive[archiveName].length} file
                  {filesByArchive[archiveName].length === 1 ? "" : "s"}
                </Badge>
              </div>

              <div className='ml-6 space-y-1'>
                {filesByArchive[archiveName].map((file) => (
                  <div
                    className='flex items-center justify-between rounded-md bg-muted/30 px-3 py-2'
                    key={file.path}>
                    <div className='flex items-center gap-3'>
                      <div className='space-y-1'>
                        <div className='font-mono text-sm'>{file.name}</div>
                        {file.path !== file.name && (
                          <div className='text-muted-foreground text-xs'>
                            {file.path}
                          </div>
                        )}
                      </div>
                    </div>
                    <span className='text-muted-foreground text-xs'>
                      {formatSize(file.size)}
                    </span>
                  </div>
                ))}
              </div>

              {archiveName !== archiveNames.at(-1) && (
                <Separator className='my-4' />
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
