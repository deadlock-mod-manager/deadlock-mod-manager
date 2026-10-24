import type { ModEntryPoint } from "@/lib/analytics/schema";
import type { ModDto } from "@deadlock-mods/shared";
import { Button } from "@deadlock-mods/ui/components/button";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { Switch } from "@deadlock-mods/ui/components/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import {
  Check,
  DownloadIcon,
  Loader2,
  X,
  XIcon,
} from "@deadlock-mods/ui/icons";
import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useHover } from "@uidotdev/usehooks";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { GrInstallOption } from "react-icons/gr";
import { RiErrorWarningLine } from "react-icons/ri";
import { FileSelectorDialog } from "@/components/downloads/file-selector-dialog";
import { OpenInPerformanceButton } from "@/components/mod-browsing/config-listing";
import { MultiFileDownloadDialog } from "@/components/downloads/multi-file-download-dialog";
import {
  HeroConflictDialog,
  type HeroConflictResolution,
} from "@/components/mod-browsing/hero-conflict-dialog";
import ErrorBoundary from "@/components/shared/error-boundary";
import { useConfigListing } from "@/hooks/performance/use-config-listing";
import { useDownload } from "@/hooks/use-download";
import { useHasOpened } from "@/hooks/use-has-opened";
import { useInstallAction } from "@/hooks/use-install-action";
import {
  modDownloadsQueryOptions,
  useModDownloads,
} from "@/hooks/use-mod-downloads";
import useUninstall from "@/hooks/use-uninstall";
import logger from "@/lib/logger";
import { resolveLocalModHero } from "@/lib/mods/hero-resolution";
import { usePersistedStore } from "@/lib/store";
import { findLocalMod } from "@/lib/store/selectors";
import { cn } from "@/lib/utils";
import { type LocalMod, ModStatus } from "@/types/mods";

interface ModButtonProps {
  remoteMod: ModDto | undefined;
  analyticsEntryPoint?: ModEntryPoint;
  variant: "iconOnly" | "default";
}

export const ModStatusIcon = ({
  status,
  hovering,
  className,
}: {
  status: ModStatus | undefined;
  hovering?: boolean;
  className?: string;
}) => {
  const loadingStatuses = [
    ModStatus.Downloading,
    ModStatus.Extracting,
    ModStatus.Paused,
    ModStatus.Removing,
    ModStatus.Installing,
  ];
  const Icon = useMemo(() => {
    switch (status) {
      case ModStatus.Paused:
        return Loader2;
      case ModStatus.Downloading:
      case ModStatus.Removing:
      case ModStatus.Installing:
        return Loader2;
      case ModStatus.Downloaded:
        return hovering ? GrInstallOption : DownloadIcon;
      case ModStatus.Installed:
        return hovering ? X : Check;
      case ModStatus.FailedToDownload:
        return ArrowClockwiseIcon;
      case ModStatus.FailedToInstall:
      case ModStatus.FailedToRemove:
        return XIcon;
      case ModStatus.Removed:
      case ModStatus.Error:
        return RiErrorWarningLine;
      case ModStatus.Extracting:
        return Loader2;
      default:
        return DownloadIcon;
    }
  }, [status, hovering]);

  return (
    <Icon
      className={cn(
        "h-4 w-4",
        {
          "animate-spin": status && loadingStatuses.includes(status),
        },
        className,
      )}
    />
  );
};

const DownloadProgressRing = ({ percentage }: { percentage: number }) => (
  <svg aria-hidden className='h-5 w-5 -rotate-90' viewBox='0 0 20 20'>
    <circle
      className='text-muted-foreground/25'
      cx='10'
      cy='10'
      fill='none'
      r='8'
      stroke='currentColor'
      strokeWidth='2.5'
    />
    <circle
      className='text-primary transition-[stroke-dashoffset] duration-200 ease-out motion-reduce:transition-none'
      cx='10'
      cy='10'
      fill='none'
      pathLength={100}
      r='8'
      stroke='currentColor'
      strokeDasharray={100}
      strokeDashoffset={100 - percentage}
      strokeLinecap='round'
      strokeWidth='2.5'
    />
  </svg>
);

const InstallModButton = ({
  remoteMod,
  variant = "default",
  analyticsEntryPoint,
}: ModButtonProps) => {
  const { t } = useTranslation();
  const heroConflictWarningEnabled = usePersistedStore(
    (state) => state.settings["hero-conflict-warning"]?.enabled ?? true,
  );

  const queryClient = useQueryClient();
  // Every catalog card renders this button, so the file list is fetched on
  // click rather than per row; the observer still picks up the cached result.
  const { availableFiles } = useModDownloads({
    remoteId: remoteMod?.remoteId,
    isDownloadable: remoteMod?.downloadable,
    enabled: false,
  });
  const {
    download,
    downloadSelectedFiles,
    retryDownload,
    closeDialog,
    localMod,
    isDialogOpen,
  } = useDownload(remoteMod, availableFiles, analyticsEntryPoint);
  const {
    performInstall,
    isAnalyzing,
    currentFileTree,
    showFileSelector,
    confirmInstallation,
    cancelInstallation,
    currentMod,
  } = useInstallAction();
  const { uninstall } = useUninstall();
  // Progress is written on every chunk; subscribing to the rounded number keeps
  // each card to at most one re-render per percent.
  const progressPercent = usePersistedStore((state) => {
    const percentage = remoteMod?.remoteId
      ? state.modProgress[remoteMod.remoteId]?.percentage
      : undefined;
    return percentage == null ? undefined : Math.round(percentage);
  });
  const removeMod = usePersistedStore((state) => state.removeMod);
  const [ref, hovering] = useHover();
  const [isActionInProgress, setIsActionInProgress] = useState(false);
  const [heroConflict, setHeroConflict] = useState<{
    heroName: string;
    currentMod: LocalMod;
    newMod: LocalMod;
  } | null>(null);
  const heroConflictResolverRef = useRef<
    ((resolution: HeroConflictResolution) => void) | null
  >(null);
  // Every catalog and library card renders this button, so its dialogs mount
  // only once they are first opened.
  const fileSelectorOpened = useHasOpened(showFileSelector);
  const downloadDialogOpened = useHasOpened(isDialogOpen);
  const heroConflictOpened = useHasOpened(heroConflict !== null);

  const askHeroConflict = useCallback(
    (heroName: string, currentMod: LocalMod, newMod: LocalMod) =>
      new Promise<HeroConflictResolution>((resolve) => {
        heroConflictResolverRef.current = resolve;
        setHeroConflict({ heroName, currentMod, newMod });
      }),
    [],
  );

  const handleHeroConflictResolve = useCallback(
    (resolution: HeroConflictResolution) => {
      const resolver = heroConflictResolverRef.current;
      heroConflictResolverRef.current = null;
      setHeroConflict(null);
      resolver?.(resolution);
    },
    [],
  );

  const fetchAvailableFiles = useCallback(async () => {
    if (!remoteMod?.remoteId || remoteMod.downloadable === false) {
      return [];
    }
    const result = await queryClient.fetchQuery(
      modDownloadsQueryOptions(remoteMod.remoteId),
    );
    return result.downloads;
  }, [queryClient, remoteMod?.remoteId, remoteMod?.downloadable]);

  const action = useCallback(async () => {
    if (isActionInProgress) {
      return;
    }

    setIsActionInProgress(true);

    try {
      switch (localMod?.status) {
        case undefined:
          await download(await fetchAvailableFiles());

          break;
        case ModStatus.Downloaded:
        case ModStatus.FailedToInstall: {
          const resolvedHero = resolveLocalModHero(localMod).hero;
          let keepBothWith: string[] | undefined;
          if (resolvedHero && heroConflictWarningEnabled) {
            // Read at click time: subscribing to the whole library would
            // re-render every card's button on any mod change.
            const conflictingMod = usePersistedStore
              .getState()
              .localMods.find(
                (m) =>
                  m.remoteId !== localMod.remoteId &&
                  m.status === ModStatus.Installed &&
                  resolveLocalModHero(m).hero === resolvedHero,
              );
            if (conflictingMod) {
              const resolution = await askHeroConflict(
                resolvedHero,
                conflictingMod,
                localMod,
              );
              if (resolution === "cancel") {
                break;
              }
              if (resolution === "swap") {
                await uninstall(conflictingMod, false);
              } else {
                keepBothWith = [conflictingMod.remoteId];
              }
            }
          }
          await performInstall(localMod, analyticsEntryPoint, keepBothWith);
          break;
        }
        case ModStatus.Installed:
          await uninstall(localMod, false);
          break;
        case ModStatus.FailedToDownload:
          await retryDownload(fetchAvailableFiles);
          break;
        case ModStatus.Error:
          removeMod(localMod.remoteId);
          break;
        default:
          break;
      }
    } finally {
      setTimeout(() => {
        setIsActionInProgress(false);
      }, 300);
    }
  }, [
    isActionInProgress,
    localMod,
    heroConflictWarningEnabled,
    download,
    fetchAvailableFiles,
    retryDownload,
    uninstall,
    removeMod,
    askHeroConflict,
    performInstall,
    analyticsEntryPoint,
    t,
    remoteMod?.remoteId,
  ]);

  const onClick = useCallback(
    async (e: React.MouseEvent<HTMLButtonElement>) => {
      if (isActionInProgress) {
        return;
      }

      try {
        e.stopPropagation();
        await action();
      } catch (error) {
        logger.withError(error).error("Failed to perform action");
        toast.error(t("notifications.failedToPerformAction"));
        setIsActionInProgress(false);
      }
    },
    [isActionInProgress, action, t],
  );

  const text = useMemo(() => {
    switch (localMod?.status) {
      case ModStatus.Installed:
        if (hovering) {
          return t("modButton.disableMod");
        }
        return t("modButton.installed");
      case ModStatus.Downloaded:
        if (hovering) {
          return t("modButton.enableMod");
        }
        return t("modButton.downloaded");
      case ModStatus.Downloading:
        return t("downloads.downloadingPercent", {
          percent: progressPercent ?? 0,
        });
      case ModStatus.Paused:
        return `${t("downloads.paused")} ${t("downloads.percentage", {
          percentage: progressPercent ?? 0,
        })}`;
      case undefined:
        return t("modButton.add");
      default:
        return t(`modButton.${localMod?.status}`);
    }
  }, [localMod?.status, t, hovering, progressPercent]);

  const tooltip = useMemo(() => {
    switch (localMod?.status) {
      case ModStatus.Installed:
        return t("modButton.installedTooltip");
      case ModStatus.Downloaded:
        return t("modButton.downloadedTooltip");
      case ModStatus.Downloading:
      case ModStatus.Paused:
        return text;
      case ModStatus.FailedToDownload:
        return t("downloads.retry");
      case undefined:
        return t("modButton.add");
      default:
        return t(`modButton.${localMod?.status}`);
    }
  }, [localMod?.status, t, text]);

  const showProgressRing =
    variant === "iconOnly" &&
    localMod?.status === ModStatus.Downloading &&
    progressPercent != null;

  const buttonVariant = useMemo(() => {
    switch (localMod?.status) {
      case ModStatus.Installed:
        if (hovering) {
          return "destructive";
        }
        return "link";
      case ModStatus.Downloaded:
        if (hovering) {
          return "default";
        }
        return "outline";
      default:
        return variant === "iconOnly" ? "outline" : "default";
    }
  }, [variant, localMod?.status, hovering]);

  return (
    <ErrorBoundary>
      {localMod?.status === ModStatus.Downloaded ||
      localMod?.status === ModStatus.Installed ? (
        <Tooltip>
          <TooltipTrigger asChild>
            {variant === "iconOnly" ? (
              <div
                className='flex items-center justify-center gap-1.5'
                onClick={(e) => e.stopPropagation()}>
                <Switch
                  aria-label={t("modButton.toggleForMod", {
                    name: remoteMod?.name,
                  })}
                  checked={localMod?.status === ModStatus.Installed}
                  disabled={isActionInProgress || isAnalyzing}
                  onCheckedChange={async () => {
                    await action();
                  }}
                />
              </div>
            ) : (
              <div
                className='flex h-9 items-center gap-2 rounded-md border border-input bg-background px-4 shadow-sm'
                onClick={(e) => e.stopPropagation()}>
                <Switch
                  aria-label={t("modButton.toggleForMod", {
                    name: remoteMod?.name,
                  })}
                  checked={localMod?.status === ModStatus.Installed}
                  disabled={isActionInProgress || isAnalyzing}
                  onCheckedChange={async () => {
                    await action();
                  }}
                />
                <span className='font-medium text-sm'>{text}</span>
              </div>
            )}
          </TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label={tooltip}
              disabled={isActionInProgress || isAnalyzing}
              icon={
                showProgressRing ? (
                  <DownloadProgressRing percentage={progressPercent} />
                ) : (
                  <ModStatusIcon
                    hovering={hovering}
                    status={localMod?.status}
                  />
                )
              }
              onClick={onClick}
              ref={ref}
              size={variant === "iconOnly" ? "icon" : "default"}
              variant={buttonVariant}>
              {variant === "iconOnly" ? null : text}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      )}

      <div className='contents' onClick={(e) => e.stopPropagation()}>
        {fileSelectorOpened && (
          <FileSelectorDialog
            fileTree={currentFileTree}
            isOpen={showFileSelector}
            modName={currentMod?.name}
            onCancel={cancelInstallation}
            onConfirm={confirmInstallation}
            onOpenChange={(open) => {
              if (!open) {
                cancelInstallation();
              }
            }}
          />
        )}

        {downloadDialogOpened && (
          <MultiFileDownloadDialog
            downloadPercentage={progressPercent ?? 0}
            files={availableFiles}
            isDownloading={
              localMod?.status === ModStatus.Downloading ||
              localMod?.status === ModStatus.Paused
            }
            isExtracting={localMod?.status === ModStatus.Extracting}
            isOpen={isDialogOpen}
            modName={
              localMod?.name || remoteMod?.name || t("modForm.unknownMod")
            }
            onClose={closeDialog}
            onDownload={downloadSelectedFiles}
          />
        )}

        {heroConflictOpened && (
          <HeroConflictDialog
            currentMod={heroConflict?.currentMod ?? null}
            heroName={heroConflict?.heroName ?? ""}
            newMod={heroConflict?.newMod ?? null}
            onResolve={handleHeroConflictResolve}
            open={heroConflict !== null}
          />
        )}
      </div>
    </ErrorBoundary>
  );
};

/**
 * Install for mods. A GameBanana upload that is a performance config opens the
 * Performance page instead, unless the user already has it as a mod.
 */
const ModButton = (props: ModButtonProps) => {
  const listing = useConfigListing(props.remoteMod);
  const hasLocalMod = usePersistedStore(
    (state) => !!findLocalMod(state.localMods, props.remoteMod?.remoteId),
  );
  if (props.remoteMod && listing === "confirmed" && !hasLocalMod) {
    return (
      <OpenInPerformanceButton
        remoteId={props.remoteMod.remoteId}
        variant={props.variant}
      />
    );
  }
  return <InstallModButton {...props} />;
};

export default ModButton;
