import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import { Separator } from "@deadlock-mods/ui/components/separator";
import {
  CloudArrowDownIcon,
  DownloadSimpleIcon,
  HardDrivesIcon,
  LockSimpleIcon,
  WarningIcon,
  WifiHighIcon,
  WifiMediumIcon,
  WifiSlashIcon,
  WifiXIcon,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useApiStatus } from "@/hooks/use-api-status";
import { useAuthStatus } from "@/hooks/use-auth-status";
import { useCheckForUpdates } from "@/hooks/use-check-for-updates";
import { useFilesystemStatus } from "@/hooks/use-filesystem-status";
import { downloadManager } from "@/lib/download/manager";
import { usePersistedStore } from "@/lib/store";
import { ModStatus } from "@/types/mods";
import { StatusIndicator } from "@/components/layout/bottom-bar/status-indicator";
import { DiscordPresenceIndicator } from "@/components/layout/bottom-bar/discord-presence-indicator";
import { HeroParserIndicator } from "@/components/layout/bottom-bar/hero-parser-indicator";
import { CatalogSyncIndicator } from "@/components/layout/bottom-bar/catalog-sync-indicator";
import { RemoteInstallIndicator } from "@/components/layout/bottom-bar/remote-install-indicator";
import { BottomBarVolume } from "@/components/layout/bottom-bar/bottom-bar-volume";

const apiStatusConfig = {
  healthy: {
    icon: WifiHighIcon,
    className: "text-status-ok",
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
    className: "text-status-ok",
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
    className: "text-status-ok",
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
  const gamePath = usePersistedStore((s) => s.gamePath);
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

  const downloadingCount = usePersistedStore(
    (state) =>
      state.localMods.filter(
        (mod) =>
          (mod.status === ModStatus.Downloading ||
            mod.status === ModStatus.Extracting) &&
          !downloadManager.isWaiting(mod),
      ).length,
  );

  const waitingCount = usePersistedStore(
    (state) =>
      state.localMods.filter((mod) => downloadManager.isWaiting(mod)).length,
  );

  const pausedCount = usePersistedStore(
    (state) =>
      state.localMods.filter((mod) => mod.status === ModStatus.Paused).length,
  );

  const apiCfg = apiStatusConfig[apiStatus];
  const authCfg = authStatusConfig[authStatus];
  const fsCfg = fsStatusConfig[fsStatus];

  return (
    <div
      className='z-30 flex h-8 w-full shrink-0 items-center justify-between border-t bg-background pl-4 pr-3 text-xs text-muted-foreground'
      data-bottom-bar='true'>
      <div className='flex items-center gap-3'>
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
          <HeroParserIndicator />
          <CatalogSyncIndicator />
          <RemoteInstallIndicator />
          <DiscordPresenceIndicator />
        </div>

        {/* After the status icons, so they don't jump under the cursor when a
            download starts or finishes. */}
        {downloadingCount > 0 && (
          <>
            <Separator className='mx-1 h-3' orientation='vertical' />
            <div className='flex items-center gap-1'>
              <DownloadSimpleIcon className='h-3 w-3 animate-pulse text-blue-500' />
              <span>
                {downloadingCount} {t("common.downloading")}
              </span>
            </div>
          </>
        )}
        {waitingCount > 0 && (
          <>
            <Separator className='mx-1 h-3' orientation='vertical' />
            <div className='flex items-center gap-1'>
              <DownloadSimpleIcon className='h-3 w-3' />
              <span>
                {waitingCount} {t("common.waiting")}
              </span>
            </div>
          </>
        )}
        {pausedCount > 0 && (
          <>
            <Separator className='mx-1 h-3' orientation='vertical' />
            <div className='flex items-center gap-1'>
              <DownloadSimpleIcon className='h-3 w-3 text-amber-500' />
              <span>
                {pausedCount} {t("common.paused")}
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
