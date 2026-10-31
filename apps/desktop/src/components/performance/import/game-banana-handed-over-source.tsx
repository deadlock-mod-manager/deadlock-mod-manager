import { getMod } from "@/lib/api-client";
import { perfQueryKeys } from "@/lib/performance/query-keys";
import { formatSize } from "@/lib/utils";
import type { CatalogDownloadsDto } from "@/types/generated/CatalogDownloadsDto";
import { Button } from "@deadlock-mods/ui/components/button";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import {
  ArrowSquareOutIcon,
  DownloadSimpleIcon,
  FileZipIcon,
  GlobeIcon,
  HeartIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Markup } from "interweave";
import { useTranslation } from "react-i18next";

export const GameBananaHandedOverSource = ({
  modId,
  fileId,
  onChangeSource,
}: {
  modId: number;
  fileId: number;
  onChangeSource: () => void;
}) => {
  const { t } = useTranslation();
  const remoteId = String(modId);
  const mod = useQuery({
    queryKey: ["mod", remoteId],
    queryFn: () => getMod(remoteId),
    staleTime: 5 * 60 * 1000,
    meta: { skipGlobalErrorHandler: true },
  });
  const files = useQuery({
    queryKey: perfQueryKeys.gameBananaFiles(modId),
    queryFn: () =>
      invoke<CatalogDownloadsDto>("get_gamebanana_submission_files", {
        remoteId,
      }),
    staleTime: 5 * 60 * 1000,
    meta: { skipGlobalErrorHandler: true },
  });
  const file = files.data?.downloads.find(
    (download) => download.fileId === String(fileId),
  );
  const cover = mod.data?.images?.[0];
  const fallbackTitle = t("performance.import.handedOver.gameBanana", {
    modId,
    fileId,
  });

  return (
    <div className='flex flex-col overflow-hidden rounded-lg border bg-card/40'>
      <div className='relative aspect-video w-full overflow-hidden bg-secondary'>
        {cover ? (
          <img
            alt={mod.data?.name ?? ""}
            className='h-full w-full object-cover'
            src={cover}
          />
        ) : mod.isLoading ? (
          <Skeleton className='h-full w-full rounded-none' />
        ) : (
          <div className='flex h-full w-full items-center justify-center'>
            <GlobeIcon className='size-8 text-muted-foreground' />
          </div>
        )}
        <div className='pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent' />
        <div className='absolute inset-x-0 bottom-0 flex flex-col gap-1 p-4'>
          {mod.isLoading ? (
            <Skeleton className='h-6 w-48' />
          ) : (
            <h3 className='line-clamp-2 font-semibold text-foreground text-xl leading-tight'>
              {mod.data?.name ?? fallbackTitle}
            </h3>
          )}
          {mod.data?.author && (
            <span className='truncate text-muted-foreground text-sm'>
              {t("performance.import.handedOver.byAuthor", {
                author: mod.data.author,
              })}
            </span>
          )}
        </div>
      </div>
      <div className='flex flex-col gap-3 p-4'>
        {mod.data && (
          <div className='flex items-center gap-4 text-muted-foreground text-xs'>
            <span className='flex items-center gap-1.5'>
              <DownloadSimpleIcon className='size-3.5' />
              {mod.data.downloadCount.toLocaleString()}
            </span>
            <span className='flex items-center gap-1.5'>
              <HeartIcon className='size-3.5' />
              {mod.data.likes.toLocaleString()}
            </span>
          </div>
        )}
        {mod.data?.description && (
          <div className='line-clamp-3 text-muted-foreground text-sm leading-relaxed'>
            <Markup content={mod.data.description} noHtml tagName='span' />
          </div>
        )}
        {file && (
          <div className='flex items-center gap-2 rounded-md border bg-background/40 px-3 py-2'>
            <FileZipIcon className='size-4 shrink-0 text-muted-foreground' />
            <span className='truncate font-mono text-xs'>{file.name}</span>
            {file.size > 0 && (
              <span className='ml-auto shrink-0 text-muted-foreground text-xs'>
                {formatSize(file.size)}
              </span>
            )}
          </div>
        )}
        <div className='flex items-center justify-between gap-2'>
          <Button onClick={onChangeSource} size='sm' variant='outline'>
            {t("performance.import.handedOver.changeSource")}
          </Button>
          {mod.data?.remoteUrl && (
            <Button
              className='gap-1.5'
              onClick={() => void openUrl(mod.data.remoteUrl)}
              size='sm'
              variant='ghost'>
              {t("performance.import.handedOver.viewOnGameBanana")}
              <ArrowSquareOutIcon className='size-3.5' />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
