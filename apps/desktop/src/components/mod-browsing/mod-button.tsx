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
  PlusIcon,
  X,
  XIcon,
} from "@deadlock-mods/ui/icons";
import { useHover } from "@uidotdev/usehooks";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { GrInstallOption } from "react-icons/gr";
import { RiErrorWarningLine } from "react-icons/ri";
import { FileSelectorDialog } from "@/components/downloads/file-selector-dialog";
import { MultiFileDownloadDialog } from "@/components/downloads/multi-file-download-dialog";
import {
  HeroConflictDialog,
  type HeroConflictResolution,
} from "@/components/mod-browsing/hero-conflict-dialog";
import { useConfirm } from "@/components/providers/alert-dialog";
import ErrorBoundary from "@/components/shared/error-boundary";
import { useAnalyticsContext } from "@/contexts/analytics-context";
import { useDownload } from "@/hooks/use-download";
import useInstallWithCollection from "@/hooks/use-install-with-collection";
import { useModDownloads } from "@/hooks/use-mod-downloads";
import useUninstall from "@/hooks/use-uninstall";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { type LocalMod, ModStatus } from "@/types/mods";

interface ModButtonProps {
  remoteMod: Pick<ModDto, "remoteId" | "name" | "downloadable"> | undefined;
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
      case ModStatus.FailedToInstall:
      case ModStatus.FailedToRemove:
        return XIcon;
      case ModStatus.Removed:
      case ModStatus.Error:
        return RiErrorWarningLine;
      default:
        return PlusIcon;
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

const ModButton = ({ remoteMod, variant = "default" }: ModButtonProps) => {
  const { t } = useTranslation();
  const { analytics } = useAnalyticsContext();
  const confirm = useConfirm();
  const localMods = usePersistedStore((state) => state.localMods);

  const { availableFiles } = useModDownloads({
    remoteId: remoteMod?.remoteId,
    isDownloadable: remoteMod?.downloadable,
  });
  const {
    download,
    downloadSelectedFiles,
    closeDialog,
    localMod,
    isDialogOpen,
  } = useDownload(remoteMod, availableFiles);
  const {
    install,
    isAnalyzing,
    currentFileTree,
    showFileSelector,
    confirmInstallation,
    cancelInstallation,
    currentMod,
  } = useInstallWithCollection();
  const { uninstall } = useUninstall();
  const getModProgress = usePersistedStore((state) => state.getModProgress);
  const setInstalledVpks = usePersistedStore((state) => state.setInstalledVpks);
  const removeMod = usePersistedStore((state) => state.removeMod);
  const setModStatus = usePersistedStore((state) => state.setModStatus);
  const setModEnabledInCurrentProfile = usePersistedStore(
    (state) => state.setModEnabledInCurrentProfile,
  );
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

  const performInstall = useCallback(
    async (mod: typeof localMod) => {
      if (!mod) {
        return;
      }
      await install(mod, {
        onStart: (m) => {
          setModStatus(m.remoteId, ModStatus.Installing);
        },
        onComplete: (m, result) => {
          setModStatus(m.remoteId, ModStatus.Installed);
          setInstalledVpks(m.remoteId, result.installed_vpks, result.file_tree);
          setModEnabledInCurrentProfile(m.remoteId, true);
          toast.success(t("notifications.modInstalledSuccessfully"));
          analytics.trackModInstalled(m.remoteId, {
            vpk_count: result.installed_vpks.length,
            file_tree_complexity: result.file_tree?.has_multiple_files
              ? "complex"
              : "simple",
          });
        },
        onError: (m, error) => {
          setModStatus(m.remoteId, ModStatus.Downloaded);
          toast.error(error.message || t("notifications.failedToInstallMod"));
          analytics.trackError(
            "mod_installation",
            error.message || "Unknown installation error",
            { mod_id: m.remoteId },
          );
        },
        onCancel: (m) => {
          setModStatus(m.remoteId, ModStatus.Downloaded);
          toast.info(t("notifications.installationCanceled"));
        },
        onFileTreeAnalyzed: (m, fileTree) => {
          if (fileTree.has_multiple_files) {
            toast.info(
              t("notifications.modContainsFiles", {
                modName: m.name,
                fileCount: fileTree.total_files,
              }),
            );
          }
        },
      });
    },
    [
      install,
      setModStatus,
      setInstalledVpks,
      setModEnabledInCurrentProfile,
      t,
      analytics,
    ],
  );

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

  const action = useCallback(async () => {
    if (isActionInProgress) {
      return;
    }

    setIsActionInProgress(true);

    try {
      switch (localMod?.status) {
        case undefined:
          await download();
          analytics.trackModDiscovered(
            remoteMod?.remoteId || "unknown",
            "browse",
          );
          break;
        case ModStatus.Downloaded:
        case ModStatus.FailedToInstall: {
          const detectedHero = localMod.detectedHero;
          if (detectedHero) {
            const conflictingMod = localMods.find(
              (m) =>
                m.remoteId !== localMod.remoteId &&
                m.status === ModStatus.Installed &&
                m.detectedHero === detectedHero,
            );
            if (conflictingMod) {
              const resolution = await askHeroConflict(
                detectedHero,
                conflictingMod,
                localMod,
              );
              if (resolution === "cancel") {
                break;
              }
              if (resolution === "swap") {
                await uninstall(conflictingMod, false);
                analytics.trackModUninstalled(
                  conflictingMod.remoteId,
                  "user_choice",
                );
              }
            }
          }
          if (localMod.usesCriticalPaths) {
            const confirmed = await confirm({
              title: t("criticalPaths.title"),
              body: t("criticalPaths.body"),
              tone: "destructive",
              cancelButton: t("criticalPaths.cancel"),
              actionButton: t("criticalPaths.confirm"),
            });
            if (!confirmed) break;
          }
          await performInstall(localMod);
          break;
        }
        case ModStatus.Installed:
          await uninstall(localMod, false);
          analytics.trackModUninstalled(localMod.remoteId, "user_choice");
          break;
        case ModStatus.FailedToDownload:
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
    localMods,
    confirm,
    download,
    uninstall,
    removeMod,
    askHeroConflict,
    performInstall,
    t,
    analytics,
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
      case undefined:
        return t("modButton.add");
      default:
        return t(`modButton.${localMod?.status}`);
    }
  }, [localMod?.status, t, hovering]);

  const tooltip = useMemo(() => {
    switch (localMod?.status) {
      case ModStatus.Installed:
        return t("modButton.installedTooltip");
      case ModStatus.Downloaded:
        return t("modButton.downloadedTooltip");
      case undefined:
        return t("modButton.add");
      default:
        return t(`modButton.${localMod?.status}`);
    }
  }, [localMod?.status, t]);

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
              <div className='flex items-center justify-center'>
                <Switch
                  checked={localMod?.status === ModStatus.Installed}
                  disabled={isActionInProgress || isAnalyzing}
                  onCheckedChange={async () => {
                    await action();
                  }}
                />
              </div>
            ) : (
              <div className='flex items-center gap-3 rounded-lg border border-input bg-background px-4 py-2.5 shadow-sm'>
                <Switch
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
              disabled={isActionInProgress || isAnalyzing}
              icon={
                <ModStatusIcon hovering={hovering} status={localMod?.status} />
              }
              onClick={onClick}
              ref={ref}
              size={variant === "iconOnly" ? "icon" : "lg"}
              title={text}
              variant={buttonVariant}>
              {variant === "iconOnly" ? null : text}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      )}

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

      <MultiFileDownloadDialog
        downloadPercentage={
          getModProgress(remoteMod?.remoteId ?? "")?.percentage ?? 0
        }
        files={availableFiles}
        isDownloading={
          localMod?.status === ModStatus.Downloading ||
          localMod?.status === ModStatus.Paused
        }
        isOpen={isDialogOpen}
        modName={localMod?.name || t("modForm.unknownMod")}
        onClose={closeDialog}
        onDownload={downloadSelectedFiles}
      />

      <HeroConflictDialog
        currentMod={heroConflict?.currentMod ?? null}
        heroName={heroConflict?.heroName ?? ""}
        newMod={heroConflict?.newMod ?? null}
        onResolve={handleHeroConflictResolve}
        open={heroConflict !== null}
      />
    </ErrorBoundary>
  );
};

export default ModButton;
