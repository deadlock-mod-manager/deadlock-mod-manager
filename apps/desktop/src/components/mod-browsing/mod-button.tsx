import type { ModDto } from '@deadlock-mods/utils';
import { useHover } from '@uidotdev/usehooks';
import { Check, DownloadIcon, Loader2, PlusIcon, X, XIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GrInstallOption } from 'react-icons/gr';
import { RiErrorWarningLine } from 'react-icons/ri';
import { toast } from 'sonner';
import { FileSelectorDialog } from '@/components/downloads/file-selector-dialog';
import { MultiFileDownloadDialog } from '@/components/downloads/multi-file-download-dialog';
import ErrorBoundary from '@/components/shared/error-boundary';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useDownload } from '@/hooks/use-download';
import useInstallWithCollection from '@/hooks/use-install-with-collection';
import { useModDownloads } from '@/hooks/use-mod-downloads';
import useUninstall from '@/hooks/use-uninstall';
import logger from '@/lib/logger';
import { usePersistedStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { ModStatus } from '@/types/mods';

interface ModButtonProps {
  remoteMod: Pick<ModDto, 'remoteId' | 'name' | 'downloadable'> | undefined;
  variant: 'iconOnly' | 'default';
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
        'h-4 w-4',
        {
          'animate-spin': status && loadingStatuses.includes(status),
        },
        className
      )}
    />
  );
};

const ModButton = ({ remoteMod, variant = 'default' }: ModButtonProps) => {
  const { availableFiles } = useModDownloads({
    remoteId: remoteMod?.remoteId,
    isDownloadable: remoteMod?.downloadable,
  });

  const { t } = useTranslation();
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
  const { setInstalledVpks, removeMod, setModStatus } = usePersistedStore();
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
                result.file_tree
              );
              toast.success('Mod installed successfully');
            },
            onError: (mod, error) => {
              setModStatus(mod.remoteId, ModStatus.Error);
              toast.error(error.message || 'Failed to install mod');
            },
            onCancel: (mod) => {
              setModStatus(mod.remoteId, ModStatus.Downloaded);
              toast.info('Installation canceled');
            },
            onFileTreeAnalyzed: (mod, fileTree) => {
              if (fileTree.has_multiple_files) {
                toast.info(
                  `${mod.name} contains ${fileTree.total_files} files. Select which ones to install.`
                );
              }
            },
          });
          break;
        case ModStatus.Installed:
          await uninstall(localMod, false);
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
        logger.error('Failed to perform action', { error });
        toast.error('Failed to perform action');
        setIsActionInProgress(false);
      }
    },
    [isActionInProgress, action]
  );

  const text = useMemo(() => {
    switch (localMod?.status) {
      case ModStatus.Installed:
        if (hovering) {
          return 'Disable Mod ?';
        }
        return t('modButton.installed');
      case ModStatus.Downloaded:
        if (hovering) {
          return 'Enable Mod ?';
        }
        return t('modButton.downloaded');
      case undefined:
        return t('modButton.add');
      default:
        return t(`modButton.${localMod?.status}`);
    }
  }, [localMod?.status, t, hovering]);

  const tooltip = useMemo(() => {
    switch (localMod?.status) {
      case ModStatus.Installed:
        return 'Mod is enabled, do you want to disable it? This will not delete the mod, just disable it ingame.';
      case ModStatus.Downloaded:
        return 'Mod is downloaded, do you want to enable it?';
      case undefined:
        return t('modButton.add');
      default:
        return t(`modButton.${localMod?.status}`);
    }
  }, [localMod?.status, t]);

  const buttonVariant = useMemo(() => {
    switch (localMod?.status) {
      case ModStatus.Installed:
        if (hovering) {
          return 'destructive';
        }
        return 'link';
      case ModStatus.Downloaded:
        if (hovering) {
          return 'default';
        }
        return 'outline';
      default:
        return variant === 'iconOnly' ? 'outline' : 'default';
    }
  }, [variant, localMod?.status, hovering]);

  return (
    <ErrorBoundary>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            disabled={isActionInProgress || isAnalyzing}
            icon={
              <ModStatusIcon hovering={hovering} status={localMod?.status} />
            }
            onClick={onClick}
            ref={ref}
            size={variant === 'iconOnly' ? 'icon' : 'lg'}
            title={text}
            variant={buttonVariant}
          >
            {variant === 'iconOnly' ? null : text}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>

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
        modName={localMod?.name || 'Unknown Mod'}
        onClose={closeDialog}
        onDownload={downloadSelectedFiles}
      />
    </ErrorBoundary>
  );
};

export default ModButton;
