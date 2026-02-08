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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { AlertCircle, Loader2 } from "@deadlock-mods/ui/icons";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatSize } from "@/lib/utils";
import logger from "@/lib/logger";
import { useBatchUpdate } from "@/hooks/use-batch-update";
import type { ModDownloadItem, UpdatableMod } from "@/types/mods";

interface BatchUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  updates: Array<{ mod: ModDto; downloads: ModDownloadItem[] }>;
}

export const BatchUpdateDialog = ({
  open,
  onOpenChange,
  updates,
}: BatchUpdateDialogProps) => {
  const { t } = useTranslation();
  const {
    updatableMods,
    setSelectedDownload,
    prepareUpdates,
    executeBatchUpdate,
    updateProgress,
  } = useBatchUpdate();
  const [isUpdating, setIsUpdating] = useState(false);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && !isUpdating) {
      onOpenChange(false);
    }
  };

  const handleConfirmUpdate = async () => {
    setIsUpdating(true);
    try {
      await executeBatchUpdate();
      onOpenChange(false);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger
        .withError(error instanceof Error ? error : new Error(String(error)))
        .error("Failed to update mods");
      toast.error(`${t("myMods.batchUpdate.error")}: ${errorMessage}`);
    } finally {
      setIsUpdating(false);
    }
  };

  if (open && updatableMods.length === 0 && updates.length > 0) {
    prepareUpdates(updates);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='max-w-3xl max-h-[80vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>{t("myMods.batchUpdate.title")}</DialogTitle>
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
                  onSelectDownload={setSelectedDownload}
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
                disabled={isUpdating}>
                {t("common.cancel")}
              </Button>
              <Button onClick={handleConfirmUpdate} disabled={isUpdating}>
                {t("myMods.updateAll")}
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
  onSelectDownload: (remoteId: string, download: ModDownloadItem) => void;
}

const UpdateModCard = ({ update, onSelectDownload }: UpdateModCardProps) => {
  const { t } = useTranslation();

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
          <div className='flex items-center gap-2'>
            <span className='text-muted-foreground'>
              {t("myMods.batchUpdate.currentVersion")}:
            </span>
            <span>
              {update.mod.filesUpdatedAt
                ? new Date(update.mod.filesUpdatedAt).toLocaleDateString()
                : "N/A"}
            </span>
          </div>
        </div>

        {update.downloads.length > 1 && (
          <div className='space-y-1'>
            <label className='text-sm font-medium'>
              {t("myMods.batchUpdate.selectVariant")}
            </label>
            <Select
              value={update.selectedDownload?.name}
              onValueChange={(name) => {
                const download = update.downloads.find((d) => d.name === name);
                if (download) {
                  onSelectDownload(update.mod.remoteId, download);
                }
              }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {update.downloads.map((download) => (
                  <SelectItem key={download.name} value={download.name}>
                    {download.name} ({formatSize(download.size)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
};
