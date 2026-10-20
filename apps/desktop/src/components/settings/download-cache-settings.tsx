import { Button } from "@deadlock-mods/ui/components/button";
import { Input } from "@deadlock-mods/ui/components/input";
import { Label } from "@deadlock-mods/ui/components/label";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { FolderOpen, RotateCcw } from "@deadlock-mods/ui/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import { getDownloadCacheLocation } from "@/lib/download-cache";
import { getErrorMessage } from "@/lib/errors";
import logger from "@/lib/logger";
import type { DownloadCacheLocation } from "@/types/generated/DownloadCacheLocation";

const LOCATION_QUERY_KEY = ["download-cache-location"];

export const DownloadCacheSettings = () => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const { data: location } = useQuery({
    queryKey: LOCATION_QUERY_KEY,
    queryFn: getDownloadCacheLocation,
  });

  const moveMutation = useMutation({
    mutationFn: (path: string | null) =>
      invoke<DownloadCacheLocation>("set_download_cache_location", { path }),
    meta: {
      skipGlobalErrorHandler: true,
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(LOCATION_QUERY_KEY, updated);
      toast.success(t("settings.downloadCacheMoved"));
    },
    onError: (error) => {
      logger.errorOnly(error);
      toast.error(t("settings.downloadCacheMoveFailed"), {
        description: getErrorMessage(error),
      });
    },
  });

  // Null moves the cache back to the app data folder.
  const moveTo = async (path: string | null) => {
    const confirmed = await confirm({
      title: t("settings.confirmMoveDownloadCache"),
      body: t("settings.confirmMoveDownloadCacheBody"),
      actionButton: t("settings.confirmMoveDownloadCacheAction"),
      cancelButton: t("common.cancel"),
    });
    if (confirmed) {
      moveMutation.mutate(path);
    }
  };

  const browse = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: t("settings.downloadCacheLocation"),
    });
    if (selected) {
      await moveTo(selected);
    }
  };

  return (
    <div className='space-y-2'>
      <Label className='font-bold text-sm' htmlFor='download-cache-path'>
        {t("settings.currentDownloadCacheLocation")}
      </Label>
      <div className='flex gap-2'>
        <Input
          className='flex-1 font-mono text-sm'
          id='download-cache-path'
          readOnly
          value={location?.path ?? ""}
        />
        <Button
          disabled={moveMutation.isPending}
          onClick={() => void browse()}
          size='icon'
          title={t("settings.browseDownloadCacheLocation")}
          variant='outline'>
          <FolderOpen className='h-4 w-4' />
        </Button>
        {location?.isCustom && (
          <Button
            disabled={moveMutation.isPending}
            onClick={() => void moveTo(null)}
            size='icon'
            title={t("settings.resetDownloadCacheLocation")}
            variant='outline'>
            <RotateCcw className='h-4 w-4' />
          </Button>
        )}
      </div>
      {moveMutation.isPending && (
        <p className='text-muted-foreground text-sm'>
          {t("settings.movingDownloadCache")}
        </p>
      )}
    </div>
  );
};
