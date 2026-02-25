import type { ModDto } from "@deadlock-mods/shared";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { Progress } from "@deadlock-mods/ui/components/progress";
import { Checkbox } from "@deadlock-mods/ui/components/checkbox";
import {
  AlertCircle,
  Calendar,
  HardDrive,
  Loader2,
  RefreshCw,
  X,
} from "@deadlock-mods/ui/icons";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { DateDisplay } from "@/components/date-display";
import { formatSize } from "@/lib/utils";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { useBatchUpdate } from "@/hooks/use-batch-update";
import type { ModDownloadItem, UpdatableMod } from "@/types/mods";

interface BatchUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  updates: Array<{ mod: ModDto; downloads: ModDownloadItem[] }>;
  isSingleMod?: boolean;
}

export const BatchUpdateDialog = ({
  open,
  onOpenChange,
  updates,
  isSingleMod = false,
}: BatchUpdateDialogProps) => {
  const { t } = useTranslation();
  const {
    updatableMods,
    setSelectedDownloads,
    prepareUpdates,
    executeBatchUpdate,
    updateProgress,
  } = useBatchUpdate();

  const batchUpdateMutation = useMutation({
    mutationFn: executeBatchUpdate,
    onSuccess: () => {
      onOpenChange(false);
    },
    onError: (error) => {
      logger.withError(error as Error).error("Failed to update mods");
      toast.error(`${t("myMods.batchUpdate.error")}`);
    },
  });

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && !batchUpdateMutation.isPending) {
      onOpenChange(false);
    }
  };

  if (open && updatableMods.length === 0 && updates.length > 0) {
    prepareUpdates(updates);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='max-w-3xl max-h-[80vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>
            {isSingleMod
              ? t("modDetail.updateMod")
              : t("myMods.batchUpdate.title")}
          </DialogTitle>
          <DialogDescription>
            {t("myMods.batchUpdate.description")}
          </DialogDescription>
        </DialogHeader>

        {updateProgress ? (
          <div className='space-y-4 py-4'>
            <div className='flex items-center justify-between'>
              <span className='text-sm font-medium capitalize flex items-center gap-2'>
                {updateProgress.currentStep}{" "}
                {updateProgress.currentStep === "downloading" && (
                  <Loader2 className='size-3.5 animate-spin' />
                )}
              </span>
              <span className='text-sm text-muted-foreground'>
                {updateProgress.completedMods} / {updateProgress.totalMods}
              </span>
            </div>
            <Progress value={updateProgress.overallProgress} />
            {updateProgress.currentMod && (
              <p className='text-sm text-muted-foreground'>
                {updateProgress.currentMod}
              </p>
            )}
          </div>
        ) : (
          <div className='space-y-4 py-4'>
            <div className='rounded-lg bg-muted p-3 flex items-start gap-2'>
              <AlertCircle className='h-5 w-5 text-muted-foreground mt-0.5' />
              <p className='text-sm text-muted-foreground'>
                {t("myMods.batchUpdate.backupNote")}
              </p>
            </div>

            <div className='space-y-3'>
              {updatableMods.map((update) => (
                <UpdateModCard
                  key={update.mod.remoteId}
                  update={update}
                  onSelectDownloads={setSelectedDownloads}
                />
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          {!updateProgress && (
            <>
              <Button
                variant='outline'
                onClick={() => onOpenChange(false)}
                disabled={batchUpdateMutation.isPending}
                icon={<X className='h-4 w-4' />}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={() => batchUpdateMutation.mutate()}
                disabled={batchUpdateMutation.isPending}
                icon={<RefreshCw className='h-4 w-4' />}>
                {isSingleMod ? t("modDetail.updateMod") : t("myMods.updateAll")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface UpdateModCardProps {
  update: UpdatableMod;
  onSelectDownloads: (remoteId: string, downloads: ModDownloadItem[]) => void;
}

const UpdateModCard = ({ update, onSelectDownloads }: UpdateModCardProps) => {
  const { t } = useTranslation();
  const localMods = usePersistedStore((state) => state.localMods);
  const localMod = localMods.find((m) => m.remoteId === update.mod.remoteId);

  const sortedDownloads = [...update.downloads].sort(
    (a, b) => (b.size || 0) - (a.size || 0),
  );
  const selectedSet = new Set(update.selectedDownloads.map((d) => d.name));
  const handleFileToggle = (download: ModDownloadItem, checked: boolean) => {
    const newSelected = checked
      ? [...update.selectedDownloads, download]
      : update.selectedDownloads.filter((d) => d.name !== download.name);
    onSelectDownloads(update.mod.remoteId, newSelected);
  };
  const handleSelectAll = () => {
    onSelectDownloads(update.mod.remoteId, update.downloads);
  };
  const handleSelectNone = () => {
    onSelectDownloads(update.mod.remoteId, [sortedDownloads[0]]);
  };

  const totalSize = update.selectedDownloads.reduce(
    (sum, d) => sum + (d.size || 0),
    0,
  );

  return (
    <div className='flex items-start gap-4 rounded-lg border p-4'>
      {update.mod.images && update.mod.images.length > 0 ? (
        <img
          src={update.mod.images[0]}
          alt={update.mod.name}
          className='h-20 w-20 rounded object-cover'
        />
      ) : (
        <div className='h-20 w-20 rounded bg-secondary flex items-center justify-center'>
          <span className='text-xs text-muted-foreground'>No image</span>
        </div>
      )}

      <div className='flex-1 space-y-2'>
        <div>
          <h4 className='font-semibold'>{update.mod.name}</h4>
          <p className='text-sm text-muted-foreground'>
            {t("mods.by")} {update.mod.author}
          </p>
        </div>

        <div className='flex items-center gap-4 text-sm'>
          <div className='flex items-center gap-1.5 text-muted-foreground'>
            <Calendar className='h-3.5 w-3.5' />
            <span>{t("myMods.batchUpdate.installedAt")}:</span>
            <DateDisplay date={localMod?.downloadedAt} inverse />
          </div>
          <div className='flex items-center gap-1.5 text-muted-foreground'>
            <RefreshCw className='h-3.5 w-3.5' />
            <span>{t("myMods.batchUpdate.updatedAt")}:</span>
            <DateDisplay date={update.mod.filesUpdatedAt} inverse />
          </div>
        </div>

        {update.downloads.length > 1 && (
          <div className='space-y-2'>
            <div className='flex items-center justify-between'>
              <label className='text-sm font-medium'>
                {t("myMods.batchUpdate.selectVariant")}
              </label>
              <div className='flex items-center gap-2 text-muted-foreground text-sm'>
                <HardDrive className='h-4 w-4' />
                {formatSize(totalSize)}
              </div>
            </div>
            <div className='flex gap-2'>
              <Button size='sm' variant='outline' onClick={handleSelectAll}>
                {t("downloads.selectAll")}
              </Button>
              <Button size='sm' variant='outline' onClick={handleSelectNone}>
                {t("downloads.selectNone")}
              </Button>
            </div>
            <div className='space-y-2 max-h-40 overflow-y-auto'>
              {sortedDownloads.map((download) => (
                <div
                  className='flex items-center space-x-3 rounded-lg border p-3 transition-colors hover:bg-muted/50'
                  key={download.name}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFileToggle(download, !selectedSet.has(download.name));
                  }}>
                  <Checkbox
                    checked={selectedSet.has(download.name)}
                    disabled={
                      selectedSet.has(download.name) && selectedSet.size === 1
                    }
                    onCheckedChange={(checked) =>
                      handleFileToggle(download, !!checked)
                    }
                  />
                  <div className='min-w-0 flex-1'>
                    <span
                      className='truncate font-medium text-foreground'
                      title={download.name}>
                      {download.name}
                    </span>
                    <span className='text-muted-foreground text-sm ml-2'>
                      {formatSize(download.size)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
