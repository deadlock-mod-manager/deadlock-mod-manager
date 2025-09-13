import type { ModDto } from '@deadlock-mods/utils';
import { useHover } from '@uidotdev/usehooks';
import { useTranslation } from 'react-i18next';
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
import { useModStatus } from '@/hooks/use-mod-status';
import useUninstall from '@/hooks/use-uninstall';
import logger from '@/lib/logger';
import { usePersistedStore } from '@/lib/store';
import { ModStatus } from '@/types/mods';
import { ModStatusIcon } from './mod-status-icon';

interface ModButtonProps {
  remoteMod: ModDto | undefined;
  variant: 'iconOnly' | 'default';
}

const ModButton = ({ remoteMod, variant = 'default' }: ModButtonProps) => {
  const { availableFiles, isLoading: isLoadingFiles } = useModDownloads({
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
  const { setInstalledVpks, removeMod } = usePersistedStore();
  const { setModStatus } = useModStatus();
  const [ref, hovering] = useHover();

  const action = () => {
    switch (localMod?.status) {
      case undefined:
      case ModStatus.Added:
        return download();
      case ModStatus.Downloaded:
        return install(localMod, {
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
      case ModStatus.Installed:
        return uninstall(localMod, false);
      case ModStatus.FailedToDownload:
        return;
      case ModStatus.Error:
        return removeMod(localMod.remoteId);
      default:
        return;
    }
  };

  const onClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    try {
      e.stopPropagation();
      action();
    } catch (error) {
      logger.error('Failed to perform action', { error });
      toast.error('Failed to perform action');
    }
  };

  const text = localMod?.status
    ? t(`modButton.${localMod?.status}`)
    : t('modButton.add');

  return (
    <ErrorBoundary>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            icon={<ModStatusIcon status={localMod?.status} />}
            onClick={onClick}
            ref={ref}
            title={text}
            variant="outline"
          >
            {variant === 'iconOnly' ? null : text}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{text}</p>
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
        isDownloading={isLoadingFiles}
        isOpen={isDialogOpen}
        modName={localMod?.name || 'Unknown Mod'}
        onClose={closeDialog}
        onDownload={downloadSelectedFiles}
      />
    </ErrorBoundary>
  );
};

export default ModButton;
