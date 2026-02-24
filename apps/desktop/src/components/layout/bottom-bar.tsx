import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deadlock-mods/ui/components/popover";
import { Slider } from "@deadlock-mods/ui/components/slider";
import { Separator } from "@deadlock-mods/ui/components/separator";
import {
  CheckCircle,
  CloudArrowDown,
  DownloadSimple,
  Package,
  SpeakerHigh,
  SpeakerLow,
  SpeakerSlash,
  WifiHigh,
  WifiMedium,
  WifiSlash,
  WifiX,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useApiStatus } from "@/hooks/use-api-status";
import { useCheckForUpdates } from "@/hooks/use-check-for-updates";
import { isGameRunning } from "@/lib/api";
import { STALE_TIME_POLL } from "@/lib/query-constants";
import { usePersistedStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { ModStatus } from "@/types/mods";

function BottomBarVolume() {
  const { t } = useTranslation();
  const audioVolume = usePersistedStore((state) => state.audioVolume);
  const setAudioVolume = usePersistedStore((state) => state.setAudioVolume);
  const [open, setOpen] = useState(false);
  const [localVolume, setLocalVolume] = useState(audioVolume);

  useEffect(() => {
    if (open) setLocalVolume(audioVolume);
  }, [open, audioVolume]);

  const handleOpenChange = (next: boolean) => {
    if (!next) setAudioVolume(localVolume);
    setOpen(next);
  };

  const VolumeIcon =
    audioVolume === 0
      ? SpeakerSlash
      : audioVolume < 50
        ? SpeakerLow
        : SpeakerHigh;

  return (
    <Popover onOpenChange={handleOpenChange} open={open}>
      <PopoverTrigger asChild>
        <button
          aria-haspopup='dialog'
          aria-label={t("settings.audioVolume")}
          className='flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'>
          <VolumeIcon className='h-3 w-3 shrink-0' />
          <span className='flex items-baseline gap-0.5'>
            <span>{t("common.volume").toUpperCase()}:</span>
            <span className='w-9 tabular-nums text-right'>{audioVolume}%</span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align='end'
        className='w-48 border bg-background p-3'
        side='top'
        sideOffset={8}>
        <div className='space-y-2'>
          <span className='text-xs font-medium uppercase text-muted-foreground'>
            {t("common.volume")}: {localVolume}%
          </span>
          <Slider
            aria-label={t("settings.audioVolume")}
            max={100}
            min={0}
            onValueChange={(value) => setLocalVolume(value[0])}
            onValueCommit={(value) => setAudioVolume(value[0])}
            step={1}
            value={[localVolume]}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

export const BottomBar = () => {
  const { t } = useTranslation();
  const localMods = usePersistedStore((state) => state.localMods);
  const { gamePath } = usePersistedStore();
  const {
    updateAvailable,
    checkForUpdates,
    installUpdate,
    isCheckingForUpdates,
    isInstallingUpdate,
  } = useCheckForUpdates();
  const { status: apiStatus } = useApiStatus();
  const { data: isRunning } = useQuery({
    queryKey: ["is-game-running"],
    queryFn: () => isGameRunning(),
    staleTime: STALE_TIME_POLL,
    refetchInterval: 5000,
    retry: false,
    enabled: !!gamePath,
  });

  const installedMods = localMods.filter(
    (mod) => mod.status === ModStatus.Installed,
  ).length;

  const downloadingMods = localMods.filter(
    (mod) => mod.status === ModStatus.Downloading,
  ).length;

  const totalMods = localMods.length;

  return (
    <div className='z-30 flex h-7 w-full items-center justify-between border-t bg-background py-2 pl-6 text-muted-foreground text-xs pr-4'>
      <div className='flex items-center gap-4'>
        <div className='flex items-center gap-1'>
          <Package className='h-3 w-3' />
          <span>
            {t("common.mods")}: {totalMods}
          </span>
          {installedMods > 0 && (
            <>
              <Separator className='mx-1 h-3' orientation='vertical' />
              <CheckCircle className='h-3 w-3 text-green-500' />
              <span>
                {installedMods} {t("common.installed")}
              </span>
            </>
          )}
        </div>

        {downloadingMods > 0 && (
          <>
            <Separator className='mx-1 h-3' orientation='vertical' />
            <div className='flex items-center gap-1'>
              <DownloadSimple className='h-3 w-3 animate-pulse text-blue-500' />
              <span>
                {downloadingMods} {t("common.downloading")}
              </span>
            </div>
          </>
        )}
      </div>

      <div className='flex items-center gap-4'>
        <div className='flex items-center gap-1'>
          {apiStatus === "healthy" && (
            <WifiHigh className='h-3 w-3 text-green-500' />
          )}
          {apiStatus === "degraded" && (
            <WifiMedium className='h-3 w-3 text-yellow-500' />
          )}
          {apiStatus === "offline" && (
            <WifiX className='h-3 w-3 text-red-500' />
          )}
          {apiStatus === "unknown" && (
            <WifiSlash className='h-3 w-3 text-muted-foreground' />
          )}
          <span className='text-xs'>
            {apiStatus === "healthy" && t("common.apiHealthy")}
            {apiStatus === "degraded" && t("common.apiDegraded")}
            {apiStatus === "offline" && t("common.apiOffline")}
            {apiStatus === "unknown" && t("common.apiUnknown")}
          </span>
        </div>

        {gamePath && (
          <>
            <Separator className='mx-1 h-3' orientation='vertical' />
            <div className='flex items-center gap-1'>
              <div
                className={cn("h-2 w-2 rounded-full", {
                  "bg-green-500": isRunning,
                  "bg-muted-foreground": !isRunning,
                })}
              />
              <span className='text-xs'>
                {isRunning ? t("common.gameRunning") : t("common.gameReady")}
              </span>
            </div>
          </>
        )}

        {!gamePath && (
          <>
            <Separator className='mx-1 h-3' orientation='vertical' />
            <Badge className='h-5 px-2 py-0 text-xs' variant='destructive'>
              {t("common.gameNotDetected")}
            </Badge>
          </>
        )}
        {updateAvailable && (
          <>
            <Separator className='mx-1 h-3' orientation='vertical' />
            <Badge className='h-5 px-2 py-0 text-xs' variant='secondary'>
              {t("update.available")}
            </Badge>
          </>
        )}
        <Separator className='mx-1 h-3' orientation='vertical' />
        <BottomBarVolume />
        <Separator className='mx-1 h-3' orientation='vertical' />
        <Button
          className='h-5 gap-1 px-2 text-xs'
          disabled={isCheckingForUpdates || isInstallingUpdate}
          onClick={() =>
            updateAvailable ? installUpdate() : checkForUpdates()
          }
          size='sm'
          variant={updateAvailable ? "default" : "ghost"}>
          <CloudArrowDown className='h-3 w-3' />
          {updateAvailable
            ? t("about.installUpdate")
            : t("about.checkForUpdates")}
        </Button>
      </div>
    </div>
  );
};
