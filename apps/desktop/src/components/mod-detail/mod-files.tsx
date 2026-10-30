import { Button } from "@deadlock-mods/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import { useTranslation } from "react-i18next";
import { formatSize } from "@/lib/utils";
import type { ModDownloadItem } from "@/types/mods";
import { DateDisplay } from "../date-display";

interface ModFilesProps {
  files: ModDownloadItem[];
  isDownloadable?: boolean;
  loadFailed?: boolean;
  isRetrying?: boolean;
  onRetry?: () => void;
}

export const ModFiles = ({
  files,
  isDownloadable = false,
  loadFailed = false,
  isRetrying = false,
  onRetry,
}: ModFilesProps) => {
  const { t } = useTranslation();

  if (!isDownloadable) {
    return null;
  }

  if ((!files || files.length === 0) && !loadFailed) {
    return null;
  }

  return (
    <Card className='shadow-none [contain:layout_style_paint]'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          {t("ui.files")}
        </CardTitle>
        <CardDescription>
          {t("ui.filesDescription")}{" "}
          {files.length > 1 ? t("ui.multipleVersionsAvailable") : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {files.length === 0 ? (
          <div
            className='flex items-center justify-between gap-2'
            data-testid='mod-files-load-error'>
            <p className='text-muted-foreground text-sm'>
              {t("modDetail.files.loadError")}
            </p>
            <Button
              isLoading={isRetrying}
              onClick={onRetry}
              size='sm'
              variant='outline'>
              {t("errors.tryAgain")}
            </Button>
          </div>
        ) : (
          <ul className='list-disc space-y-2'>
            {files.map((file) => (
              <li className='flex flex-col gap-0.5 text-sm' key={file.name}>
                <div className='flex items-center justify-between'>
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
                </div>
                {file.description && (
                  <p className='text-muted-foreground text-xs line-clamp-2'>
                    {file.description}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};
