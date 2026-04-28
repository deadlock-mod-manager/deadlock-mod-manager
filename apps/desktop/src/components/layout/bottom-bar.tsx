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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { Progress } from "@deadlock-mods/ui/components/progress";
import {
  ArchiveIcon,
  ArrowsClockwiseIcon,
  CheckCircleIcon,
  CloudArrowDownIcon,
  DownloadSimpleIcon,
  HardDrivesIcon,
  LockSimpleIcon,
  SpeakerHighIcon,
  SpeakerLowIcon,
  SpeakerSlashIcon,
  WarningIcon,
  WifiHighIcon,
  WifiMediumIcon,
  WifiSlashIcon,
  WifiXIcon,
} from "@phosphor-icons/react";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import RelayStatusPopover from "@/components/server-browser/relay-status-popover";
import { useApiStatus } from "@/hooks/use-api-status";
import { useAuthStatus } from "@/hooks/use-auth-status";
import { useCheckForUpdates } from "@/hooks/use-check-for-updates";
import { useFilesystemStatus } from "@/hooks/use-filesystem-status";
import { useFeatureFlag } from "@/hooks/use-feature-flags";
import { useRelaysHealth } from "@/hooks/use-relays-health";
import { usePersistedStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { ModStatus } from "@/types/mods";

function StatusIndicator({
  icon: Icon,
  tooltip,
  className,
}: {
  icon: PhosphorIcon;
  tooltip: string;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className='flex cursor-default items-center justify-center p-0.5'>
          <Icon className={cn("h-3.5 w-3.5", className)} />
        </div>
      </TooltipTrigger>
      <TooltipContent side='top' sideOffset={8}>
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function HeroParserIndicator() {
  const { t } = useTranslation();
  const heroDetection = usePersistedStore((state) => state.heroDetection);
  const isScanning = heroDetection.status === "scanning";
  const percentage =
    heroDetection.total > 0
      ? Math.round((heroDetection.current / heroDetection.total) * 100)
      : 0;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className='flex cursor-default items-center justify-center p-0.5'>
          {isScanning ? (
            <ArrowsClockwiseIcon className='h-3.5 w-3.5 animate-spin text-blue-500' />
          ) : (
            <CheckCircleIcon className='h-3.5 w-3.5 text-primary' />
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent
        className='w-48 space-y-1.5 p-2'
        side='top'
        sideOffset={8}>
        {isScanning ? (
          <>
            <p className='text-xs font-medium'>
              {t("heroParser.scanning", {
                current: heroDetection.current + 1,
                total: heroDetection.total,
              })}
            </p>
            {heroDetection.currentModName && (
              <p className='truncate text-xs text-muted-foreground'>
                {t("heroParser.scanningMod", {
                  modName: heroDetection.currentModName,
                })}
              </p>
            )}
            <Progress className='h-1' value={percentage} />
          </>
        ) : (
          <p className='text-xs'>{t("heroParser.idle")}</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

function ModCompressionIndicator() {
  const { t } = useTranslation();
  const compressionEnabled = usePersistedStore(
    (state) => state.compressionEnabled,
  );
  const compressionProgress = usePersistedStore(
    (state) => state.compressionProgress,
  );
  if (!compressionEnabled) {
    return null;
  }
  const isBusy =
    compressionProgress.status === "merging" ||
    compressionProgress.status === "extracting";
  const percentage =
    compressionProgress.total > 0
      ? Math.round(
          (compressionProgress.current / compressionProgress.total) * 100,
        )
      : 0;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className='flex cursor-default items-center justify-center p-0.5'>
          {isBusy ? (
            <ArrowsClockwiseIcon className='h-3.5 w-3.5 animate-spin text-blue-500' />
          ) : (
            <ArchiveIcon className='h-3.5 w-3.5 text-primary' />
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent
        className='w-48 space-y-1.5 p-2'
        side='top'
        sideOffset={8}>
        {isBusy ? (
          <>
            <p className='text-xs font-medium'>
              {t("modCompression.progress", {
                current: compressionProgress.current,
                total: compressionProgress.total,
              })}
            </p>
            <Progress className='h-1' value={percentage} />
          </>
        ) : compressionProgress.shardCount > 0 ? (
          <p className='text-xs font-medium'>
            {t("modCompression.shardCount", {
              count: compressionProgress.shardCount,
            })}
          </p>
        ) : (
          <p className='text-xs'>{t("modCompression.idle")}</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

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

  let VolumeIcon: typeof SpeakerSlashIcon;

  if (audioVolume === 0) {
    VolumeIcon = SpeakerSlashIcon;
  } else if (audioVolume < 50) {
    VolumeIcon = SpeakerLowIcon;
  } else {
    VolumeIcon = SpeakerHighIcon;
  }

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

const apiStatusConfig = {
  healthy: {
    icon: WifiHighIcon,
    className: "text-primary",
    key: "common.apiHealthy",
  },
  degraded: {
    icon: WifiMediumIcon,
    className: "text-yellow-500",
    key: "common.apiDegraded",
  },
  offline: {
    icon: WifiXIcon,
    className: "text-red-500",
    key: "common.apiOffline",
  },
  unknown: {
    icon: WifiSlashIcon,
    className: "text-muted-foreground",
    key: "common.apiUnknown",
  },
} as const;

const authStatusConfig = {
  online: {
    className: "text-primary",
    key: "common.authOnline",
  },
  offline: {
    className: "text-red-500",
    key: "common.authOffline",
  },
  unknown: {
    className: "text-muted-foreground",
    key: "common.authUnknown",
  },
} as const;

const fsStatusConfig = {
  writable: {
    icon: HardDrivesIcon,
    className: "text-primary",
    key: "common.fsWritable",
  },
  readonly: {
    icon: WarningIcon,
    className: "text-red-500",
    key: "common.fsReadonly",
  },
  unknown: {
    icon: HardDrivesIcon,
    className: "text-muted-foreground",
    key: "common.fsUnknown",
  },
} as const;

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
  const { status: authStatus } = useAuthStatus();
  const { status: fsStatus } = useFilesystemStatus();
  const { relays } = useRelaysHealth();
  const { isEnabled: isServerBrowserEnabled } = useFeatureFlag(
    "server-browser",
    false,
  );

  const downloadingCount = localMods.filter(
    (mod) =>
      mod.status === ModStatus.Downloading ||
      mod.status === ModStatus.Extracting,
  ).length;

  const pausedCount = localMods.filter(
    (mod) => mod.status === ModStatus.Paused,
  ).length;

  const apiCfg = apiStatusConfig[apiStatus];
  const authCfg = authStatusConfig[authStatus];
  const fsCfg = fsStatusConfig[fsStatus];

  return (
    <div className='z-30 flex h-8 w-full shrink-0 items-center justify-between border-t bg-background pl-4 pr-3 text-xs text-muted-foreground'>
      <div className='flex items-center gap-3'>
        {downloadingCount > 0 && (
          <>
            <div className='flex items-center gap-1'>
              <DownloadSimpleIcon className='h-3 w-3 animate-pulse text-blue-500' />
              <span>
                {downloadingCount} {t("common.downloading")}
              </span>
            </div>
            <Separator className='mx-1 h-3' orientation='vertical' />
          </>
        )}
        {pausedCount > 0 && (
          <>
            <div className='flex items-center gap-1'>
              <DownloadSimpleIcon className='h-3 w-3 text-amber-500' />
              <span>
                {pausedCount} {t("common.paused")}
              </span>
            </div>
            <Separator className='mx-1 h-3' orientation='vertical' />
          </>
        )}
        <div className='flex items-center gap-1.5'>
          <span className='text-xs text-muted-foreground'>
            {t("common.status")}:
          </span>
          <StatusIndicator
            className={apiCfg.className}
            icon={apiCfg.icon}
            tooltip={t(apiCfg.key)}
          />
          <StatusIndicator
            className={authCfg.className}
            icon={LockSimpleIcon}
            tooltip={t(authCfg.key)}
          />
          {gamePath && (
            <StatusIndicator
              className={fsCfg.className}
              icon={fsCfg.icon}
              tooltip={t(fsCfg.key)}
            />
          )}
          {isServerBrowserEnabled && relays.length > 0 && (
            <RelayStatusPopover
              align='start'
              relays={relays}
              side='top'
              variant='compact'
            />
          )}
          <ModCompressionIndicator />
          <HeroParserIndicator />
        </div>

        {!gamePath && (
          <>
            <Separator className='mx-1 h-3' orientation='vertical' />
            <Badge className='h-5 px-2 py-0 text-xs' variant='destructive'>
              {t("common.gameNotDetected")}
            </Badge>
          </>
        )}
      </div>

      <div className='flex items-center'>
        <Separator className='mx-1 h-3' orientation='vertical' />
        <BottomBarVolume />
        <Separator className='mx-1 h-3' orientation='vertical' />
        {updateAvailable && (
          <Badge className='h-5 px-2 py-0 text-xs mr-1' variant='secondary'>
            {t("update.available")}
          </Badge>
        )}
        <Button
          className='h-5 gap-1 px-2 text-xs'
          disabled={isCheckingForUpdates || isInstallingUpdate}
          onClick={() =>
            updateAvailable ? installUpdate() : checkForUpdates()
          }
          size='sm'
          variant={updateAvailable ? "default" : "ghost"}>
          <CloudArrowDownIcon className='h-3 w-3' />
          {updateAvailable
            ? t("about.installUpdate")
            : t("about.checkForUpdates")}
        </Button>
      </div>
    </div>
  );
};
