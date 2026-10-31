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
import { AlertCircle, Loader2, RefreshCw } from "@deadlock-mods/ui/icons";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { modDownloadsQueryOptions } from "@/hooks/use-mod-downloads";
import { formatSize } from "@/lib/utils";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { backsUpUpdate, useBatchUpdate } from "@/hooks/use-batch-update";
import { BatchUpdateFailureDetails } from "@/components/my-mods/batch-update-failure-details";
import { FileSelectorDialog } from "@/components/downloads/file-selector-dialog";
import {
  getBatchUpdateFailure,
  remainingUpdateTargets,
} from "@/lib/mods/batch-update-failures";
import type { ModUpdateCandidate } from "@/types/mods";
import { UpdateModCard } from "./update-mod-card";

interface BatchUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  updates: ModUpdateCandidate[];
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
    pendingSelections,
    dismissSelection,
  } = useBatchUpdate();
  const pendingSelection = pendingSelections[0];
  const skipModUpdate = usePersistedStore((state) => state.skipModUpdate);
  const queryClient = useQueryClient();
  const [refreshingFiles, setRefreshingFiles] = useState(false);
  // The refresh below writes the downloads query, which hands the mod page a
  // new `updates` array; keying on mod ids keeps that from refetching forever.
  const updatesRef = useRef(updates);
  updatesRef.current = updates;
  const updateIds = updates.map((update) => update.mod.remoteId).join("|");
  const stepPercentage = updateProgress?.isBackingUp
    ? updateProgress.backupPercentage
    : updateProgress?.downloadPercentage;

  const batchUpdateMutation = useMutation({
    mutationFn: executeBatchUpdate,
    meta: { skipGlobalErrorHandler: true },
    onSuccess: (result) => {
      if (result.failed.length === 0 && result.selectionRequired.length === 0)
        onOpenChange(false);
    },
    onError: (error) => {
      logger.withError(error).error("Failed to update mods");
    },
  });

  const { reset: resetBatchUpdate } = batchUpdateMutation;
  const localMods = usePersistedStore((state) => state.localMods);
  const profiles = usePersistedStore((state) => state.profiles);
  const targets =
    batchUpdateMutation.variables?.map((target) => {
      const update = updatableMods.find(
        (candidate) => candidate.mod.remoteId === target.mod.remoteId,
      );
      // A VPK pick only lives on the target it was sent with.
      return update
        ? { ...update, selectedFileTree: target.selectedFileTree }
        : target;
    }) ?? updatableMods;
  const pendingUpdates = remainingUpdateTargets(
    targets,
    batchUpdateMutation.data,
  );
  const failure = batchUpdateMutation.isError
    ? getBatchUpdateFailure(
        batchUpdateMutation.error,
        localMods,
        Object.values(profiles),
      )
    : undefined;
  const hasFailures =
    !!failure || (batchUpdateMutation.data?.failed.length ?? 0) > 0;
  const backupMode = usePersistedStore((state) => state.backupMode);
  const profileFolder = usePersistedStore(
    (state) => state.getActiveProfile()?.folderName ?? null,
  );
  const backsUp = backsUpUpdate(backupMode, pendingUpdates.length);
  const { data: backupSize } = useQuery({
    queryKey: ["update-backup-size", profileFolder, updateIds],
    queryFn: () =>
      invoke<number>("estimate_update_backup_size", {
        modIds: updatesRef.current.map((update) => update.mod.remoteId),
        profileFolder,
      }),
    enabled: open && backsUp,
    staleTime: 0,
    gcTime: 0,
  });
  let backupNote = t("myMods.batchUpdate.noBackupNote");
  if (backsUp) {
    backupNote =
      backupSize === undefined
        ? t("myMods.batchUpdate.backupNote")
        : t("myMods.batchUpdate.backupNoteWithSize", {
            size: formatSize(backupSize),
          });
  }

  let updateLabel = t(isSingleMod ? "modDetail.updateMod" : "myMods.updateAll");
  if (hasFailures) {
    updateLabel = t(
      batchUpdateMutation.data
        ? "myMods.batchUpdate.retryFailed"
        : "myMods.batchUpdate.retry",
    );
  }

  useEffect(() => {
    if (!open) {
      resetBatchUpdate();
      prepareUpdates([]);
      return;
    }
    const pending = updatesRef.current;
    prepareUpdates(pending);
    // Update checks reuse a cached file list; authors who replace files would
    // leave it pointing at ids GameBanana no longer serves.
    let cancelled = false;
    setRefreshingFiles(true);
    void Promise.all(
      pending.map(async (update) => {
        try {
          const { downloads } = await queryClient.fetchQuery({
            ...modDownloadsQueryOptions(update.mod.remoteId),
            staleTime: 0,
          });
          return downloads.length > 0 ? { ...update, downloads } : update;
        } catch (error) {
          logger.withError(error).warn("Failed to refresh update files");
          return update;
        }
      }),
    ).then((fresh) => {
      if (cancelled) return;
      prepareUpdates(fresh);
      setRefreshingFiles(false);
    });
    return () => {
      cancelled = true;
      setRefreshingFiles(false);
    };
  }, [open, updateIds, prepareUpdates, queryClient, resetBatchUpdate]);

  const handleSkip = (mod: ModDto, updatedAt: number) => {
    skipModUpdate(mod.remoteId, updatedAt);
    toast.success(t("myMods.batchUpdate.skipped", { name: mod.name }));
    if (updatableMods.length <= 1) {
      onOpenChange(false);
    }
  };

  const handleDismissSelection = () => {
    if (
      pendingSelection &&
      dismissSelection(pendingSelection.modId) === 0 &&
      !hasFailures
    ) {
      onOpenChange(false);
    }
  };

  return (
    <>
      {/* Not tied to `open`: the update finishes even if the dialog was closed. */}
      <FileSelectorDialog
        isOpen={!!pendingSelection && !batchUpdateMutation.isPending}
        onOpenChange={(isOpen) => {
          if (!isOpen) handleDismissSelection();
        }}
        fileTree={pendingSelection?.fileTree ?? null}
        modName={pendingSelection?.modName}
        onConfirm={(fileTree) => {
          if (!pendingSelection) return;
          onOpenChange(true);
          batchUpdateMutation.mutate([
            { ...pendingSelection.target, selectedFileTree: fileTree },
            // This run replaces the last result, so the batch's failures retry
            // with it instead of vanishing from the dialog.
            ...pendingUpdates.filter(
              (update) => update.mod.remoteId !== pendingSelection.modId,
            ),
          ]);
        }}
        onCancel={handleDismissSelection}
      />
      <Dialog open={open} onOpenChange={onOpenChange}>
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
                  {updateProgress.isBackingUp
                    ? t("myMods.batchUpdate.backingUp")
                    : updateProgress.currentStep}{" "}
                  {(updateProgress.isBackingUp ||
                    updateProgress.isDownloading) && (
                    <>
                      {stepPercentage !== undefined && (
                        <span className='tabular-nums text-muted-foreground'>
                          {t("downloads.percentage", {
                            percentage: Math.round(stepPercentage),
                          })}
                        </span>
                      )}
                      <Loader2 className='size-3.5 animate-spin' />
                    </>
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
              {hasFailures && (
                <BatchUpdateFailureDetails
                  key={batchUpdateMutation.submittedAt}
                  failure={failure}
                  result={batchUpdateMutation.data}
                  mods={targets.map((target) => target.mod)}
                />
              )}
              <div className='rounded-lg bg-muted p-3 flex items-start gap-2'>
                <AlertCircle className='h-5 w-5 text-muted-foreground mt-0.5' />
                <p className='text-sm text-muted-foreground'>{backupNote}</p>
              </div>

              <div className='space-y-3'>
                {pendingUpdates.map((update) => {
                  const { updatedAt } = update;
                  return (
                    <UpdateModCard
                      key={update.mod.remoteId}
                      update={update}
                      onSelectDownloads={setSelectedDownloads}
                      onSkip={
                        !hasFailures &&
                        !batchUpdateMutation.isPending &&
                        updatedAt !== undefined
                          ? () => handleSkip(update.mod, updatedAt)
                          : undefined
                      }
                    />
                  );
                })}
              </div>
            </div>
          )}

          <DialogFooter>
            {!updateProgress && (
              <>
                <Button
                  variant='outline'
                  onClick={() => onOpenChange(false)}
                  disabled={batchUpdateMutation.isPending}>
                  {t(hasFailures ? "common.close" : "common.cancel")}
                </Button>
                <Button
                  onClick={() => batchUpdateMutation.mutate(pendingUpdates)}
                  disabled={
                    batchUpdateMutation.isPending ||
                    refreshingFiles ||
                    pendingUpdates.length === 0 ||
                    pendingUpdates.some(
                      (update) => update.selectedDownloads.length === 0,
                    )
                  }
                  icon={<RefreshCw className='h-4 w-4' />}>
                  {updateLabel}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
