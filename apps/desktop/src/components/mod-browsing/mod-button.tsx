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
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { GrInstallOption } from "react-icons/gr";
import { RiErrorWarningLine } from "react-icons/ri";
import { FileSelectorDialog } from "@/components/downloads/file-selector-dialog";
import { MultiFileDownloadDialog } from "@/components/downloads/multi-file-download-dialog";
import ErrorBoundary from "@/components/shared/error-boundary";
import { useAnalyticsContext } from "@/contexts/analytics-context";
import { useDownload } from "@/hooks/use-download";
import useInstallWithCollection from "@/hooks/use-install-with-collection";
import { useModDownloads } from "@/hooks/use-mod-downloads";
import useUninstall from "@/hooks/use-uninstall";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { ModStatus } from "@/types/mods";

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
  const { availableFiles } = useModDownloads({
    remoteId: remoteMod?.remoteId,
    isDownloadable: remoteMod?.downloadable,
  });

  const { t } = useTranslation();
  const { analytics } = useAnalyticsContext();
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
    setShowFileSelector,
    confirmInstallation,
    cancelInstallation,
    currentMod,
  } = useInstallWithCollection();
  const { uninstall } = useUninstall();
  const {
    setInstalledVpks,
    removeMod,
    setModStatus,
    setModEnabledInCurrentProfile,
  } = usePersistedStore();
  const [ref, hovering] = useHover();
  const [isActionInProgress, setIsActionInProgress] = useState(false);

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
          await install(localMod, {
            onStart: (mod) => {
              setModStatus(mod.remoteId, ModStatus.Installing);
            },
            onComplete: (mod, result) => {
              setModStatus(mod.remoteId, ModStatus.Installed);
              setInstalledVpks(
                mod.remoteId,
                result.installed_vpks,
                result.file_tree,
              );
              // Mark mod as enabled in current profile
              setModEnabledInCurrentProfile(mod.remoteId, true);
              toast.success(t("notifications.modInstalledSuccessfully"));
              analytics.trackModInstalled(mod.remoteId, {
                vpk_count: result.installed_vpks.length,
                file_tree_complexity: result.file_tree?.has_multiple_files
                  ? "complex"
                  : "simple",
              });
            },
            onError: (mod, error) => {
              setModStatus(mod.remoteId, ModStatus.Error);
              toast.error(
                error.message || t("notifications.failedToInstallMod"),
              );
              analytics.trackError(
                "mod_installation",
                error.message || "Unknown installation error",
                {
                  mod_id: mod.remoteId,
                },
              );
            },
            onCancel: (mod) => {
              setModStatus(mod.remoteId, ModStatus.Downloaded);
              toast.info(t("notifications.installationCanceled"));
            },
            onFileTreeAnalyzed: (mod, fileTree) => {
              if (fileTree.has_multiple_files) {
                toast.info(
                  t("notifications.modContainsFiles", {
                    modName: mod.name,
                    fileCount: fileTree.total_files,
                  }),
                );
              }
            },
          });
          break;
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
      // Add a small delay to prevent rapid successive clicks
      setTimeout(() => {
        setIsActionInProgress(false);
      }, 300);
    }
  }, [
    isActionInProgress,
    localMod,
    download,
    install,
    uninstall,
    removeMod,
    setModStatus,
    setInstalledVpks,
    setModEnabledInCurrentProfile,
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
        logger
          .withError(error instanceof Error ? error : new Error(String(error)))
          .error("Failed to perform action");
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
        onOpenChange={setShowFileSelector}
      />

      <MultiFileDownloadDialog
        files={availableFiles}
        isDownloading={localMod?.status === ModStatus.Downloading}
        isOpen={isDialogOpen}
        modName={localMod?.name || t("modForm.unknownMod")}
        onClose={closeDialog}
        onDownload={downloadSelectedFiles}
      />
    </ErrorBoundary>
  );
};

export default ModButton;
