import { analytics } from "@/lib/analytics";
import { failureOutcome } from "@/lib/analytics/client";
import { isTauriError } from "@/types/tauri";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DownloadProgressEvent } from "@/lib/download/manager";
import logger from "@/lib/logger";
import { applyDownloadProgress } from "@/lib/mods/batch-update-progress";
import { usePersistedStore } from "@/lib/store";
import { BatchUpdateResultSchema } from "@/lib/validation/batch-update";
import type {
  BatchUpdateProgressEvent,
  BatchUpdateResult,
  ModDownloadItem,
  ModUpdateCandidate,
  PendingSelection,
  ProfileImportMod,
  UpdatableMod,
} from "@/types/mods";
import { ModStatus } from "@/types/mods";
import { invokeGuarded } from "@/lib/game-guard";

const getUpdateProgress = () =>
  usePersistedStore.getState().batchUpdateProgress;

const listenForUpdateProgress = async () => {
  const { setBatchUpdateProgress } = usePersistedStore.getState();
  const unlisteners = await Promise.all([
    listen<BatchUpdateProgressEvent>("batch-update-progress", (event) => {
      const previous = getUpdateProgress();
      if (!previous) return;
      const progress = event.payload;
      setBatchUpdateProgress({
        currentStep: progress.currentStep,
        modIds: previous.modIds,
        currentModId: progress.currentModId || undefined,
        currentMod: progress.currentModName || undefined,
        completedMods: progress.currentModIndex,
        totalMods: progress.totalMods,
        overallProgress: progress.overallProgress,
        isBackingUp: progress.currentStep === "backingUp",
        isDownloading: progress.currentStep === "downloading",
        isInstalling: progress.currentStep === "installing",
      });
    }),
    listen<{ progress: number }>("backup-progress", (event) => {
      const previous = getUpdateProgress();
      if (!previous?.isBackingUp) return;
      setBatchUpdateProgress({
        ...previous,
        backupPercentage: event.payload.progress,
      });
    }),
    listen<DownloadProgressEvent>("download-progress", (event) => {
      const previous = getUpdateProgress();
      const next = applyDownloadProgress(
        previous,
        event.payload.modId,
        event.payload.percentage,
      );
      if (next !== previous) setBatchUpdateProgress(next);
    }),
  ]);

  return () => {
    for (const unlisten of unlisteners) unlisten();
  };
};

// GameBanana tells uploads that share a file name apart with a random
// `_xxxxx` suffix, so a re-uploaded pack keeps its name up to that suffix.
const uploadBaseName = (name: string) =>
  name.replace(/_[0-9a-f]{5}(\.[^.]+)$/i, "$1").toLowerCase();

export const useBatchUpdate = () => {
  const [updatableMods, setUpdatableMods] = useState<UpdatableMod[]>([]);
  const [pendingSelections, setPendingSelections] = useState<
    (PendingSelection & { target: UpdatableMod })[]
  >([]);
  const { t } = useTranslation();
  const getActiveProfile = usePersistedStore((state) => state.getActiveProfile);
  const setInstalledVpks = usePersistedStore((state) => state.setInstalledVpks);
  const setStoreSelectedDownloads = usePersistedStore(
    (state) => state.setSelectedDownloads,
  );
  const updateModVpksAfterReorder = usePersistedStore(
    (state) => state.updateModVpksAfterReorder,
  );
  const localMods = usePersistedStore((state) => state.localMods);
  const backupEnabled = usePersistedStore((state) => state.backupEnabled);
  const maxBackupCount = usePersistedStore((state) => state.maxBackupCount);
  const updateProgress = usePersistedStore(
    (state) => state.batchUpdateProgress,
  );
  const setUpdateProgress = usePersistedStore(
    (state) => state.setBatchUpdateProgress,
  );

  const prepareUpdates = useCallback(
    (updates: ModUpdateCandidate[]) => {
      const prepared = updates.map((update) => {
        const localMod = localMods.find(
          (m) => m.remoteId === update.mod.remoteId,
        );

        let selectedDownloads: ModDownloadItem[];
        if (update.downloads.length === 1) {
          selectedDownloads = update.downloads;
        } else {
          const savedNames = new Set(
            (localMod?.selectedDownloads ?? []).map((sd) => sd.name),
          );
          const installedArchiveNames = new Set(
            (localMod?.installedFileTree?.files ?? [])
              .filter((f) => f.is_selected)
              .map((f) => f.archive_name),
          );

          // Archived files are older versions of current ones; installing
          // both ships the same VPK names twice.
          const current = update.downloads.filter((d) => !d.isArchived);
          const currentNames = new Set(current.map((d) => d.name));
          const reuploaded = new Set(
            [...savedNames, ...installedArchiveNames]
              .filter((name) => !currentNames.has(name))
              .map(uploadBaseName),
          );
          const matched = current.filter(
            (d) =>
              savedNames.has(d.name) ||
              installedArchiveNames.has(d.name) ||
              reuploaded.has(uploadBaseName(d.name)),
          );
          selectedDownloads =
            matched.length > 0
              ? matched
              : current.length > 0
                ? current
                : update.downloads;
        }

        const selectedFileTree = localMod?.installedFileTree;

        return {
          mod: update.mod,
          updatedAt: update.updatedAt,
          downloads: update.downloads,
          selectedDownloads,
          selectedFileTree,
        };
      });

      setUpdatableMods((previous) => {
        if (prepared.length === 0 && previous.length === 0) return previous;
        return prepared.map((update) => {
          const existing = previous.find(
            (m) => m.mod.remoteId === update.mod.remoteId,
          );
          const keptDownloads = existing?.selectedDownloads.filter((selected) =>
            update.downloads.some((d) => d.url === selected.url),
          );
          return existing && keptDownloads?.length
            ? {
                ...update,
                selectedDownloads: keptDownloads,
                selectedFileTree: existing.selectedFileTree,
              }
            : update;
        });
      });
      return prepared;
    },
    [localMods],
  );

  const setSelectedDownloads = (
    remoteId: string,
    downloads: ModDownloadItem[],
  ) => {
    setUpdatableMods((mods) =>
      mods.map((m) =>
        m.mod.remoteId === remoteId
          ? { ...m, selectedDownloads: downloads }
          : m,
      ),
    );
  };

  /** `selectionRequired` in the result lists every mod still waiting for a
   * VPK choice, including ones from earlier runs. */
  const executeBatchUpdate = async (
    targets: UpdatableMod[],
  ): Promise<BatchUpdateResult> => {
    const originalMods = usePersistedStore.getState().localMods;
    const previousStatuses = new Map(
      originalMods.map((mod) => [mod.remoteId, mod.status]),
    );
    const activeProfile = getActiveProfile();
    const profileFolder = activeProfile?.folderName ?? "";

    logger
      .withMetadata({
        modsCount: targets.length,
        profileFolder,
      })
      .info("Starting batch mod update");

    const stopListening = await listenForUpdateProgress();
    const attempt = analytics.start("mod_update", {
      mod_count: targets.length,
    });

    try {
      setUpdateProgress({
        currentStep: t("myMods.batchUpdate.updating"),
        modIds: targets.map((um) => um.mod.remoteId),
        completedMods: 0,
        totalMods: targets.length,
        overallProgress: 0,
        isDownloading: false,
        isInstalling: false,
      });

      const batchUpdateMods: ProfileImportMod[] = targets.map((um) => {
        const localMod = originalMods.find(
          (m) => m.remoteId === um.mod.remoteId,
        );
        return {
          enabled: localMod?.status === ModStatus.Installed,
          modId: um.mod.remoteId,
          modName: um.mod.name,
          downloadFiles: um.selectedDownloads.map((d) => ({
            url: d.url,
            name: d.name,
            size: d.size,
          })),
          fileTree: um.selectedFileTree,
          installedVpks: localMod?.installedVpks ?? [],
          isMap: um.mod.isMap,
        };
      });

      const rawResult = await invokeGuarded("batch_update_mods", {
        mods: batchUpdateMods,
        profileFolder,
        // Mods sent back for a VPK choice were left untouched by the run that
        // already backed up addons.
        skipBackup:
          !backupEnabled ||
          targets.every((target) =>
            pendingSelections.some(
              (pending) => pending.modId === target.mod.remoteId,
            ),
          ),
        maxBackups: maxBackupCount,
      });

      const result = BatchUpdateResultSchema.parse(rawResult);
      const activeProfileId = activeProfile?.id;

      if (result.vpkMappings && result.vpkMappings.length > 0) {
        updateModVpksAfterReorder(result.vpkMappings, activeProfileId);
      }

      for (const installedModInfo of result.installedMods) {
        const updatableMod = targets.find(
          (m) => m.mod.remoteId === installedModInfo.modId,
        );

        if (updatableMod) {
          setInstalledVpks(
            installedModInfo.modId,
            installedModInfo.installedVpks,
            installedModInfo.fileTree,
          );
          setStoreSelectedDownloads(
            installedModInfo.modId,
            updatableMod.selectedDownloads,
          );

          usePersistedStore
            .getState()
            .markModUpdated(
              installedModInfo.modId,
              activeProfileId,
              batchUpdateMods.find(
                (mod) => mod.modId === installedModInfo.modId,
              )?.enabled === false
                ? ModStatus.Downloaded
                : ModStatus.Installed,
              updatableMod.mod.filesUpdatedAt,
            );
        }
      }

      const awaitingChoice = result.selectionRequired.length > 0;
      attempt.finish(
        result.failed.length === 0 && !awaitingChoice
          ? "completed"
          : result.succeeded.length > 0 || awaitingChoice
            ? "partial"
            : "failed",
        {
          updated_mod_count: result.succeeded.length,
          failed_mod_count: result.failed.length,
        },
      );
      if (result.failed.length > 0) {
        logger
          .withMetadata({
            failed: result.failed.length,
            succeeded: result.succeeded.length,
          })
          .warn("Some mods failed to update");
      } else if (!awaitingChoice) {
        toast.success(t("myMods.batchUpdate.complete"));
      }

      const selectionRequired = [
        ...pendingSelections.filter(
          (pending) =>
            !targets.some((target) => target.mod.remoteId === pending.modId),
        ),
        // The dialog's list empties when it closes, so each pick keeps its target.
        ...result.selectionRequired.flatMap((pending) => {
          const target = targets.find(
            (um) => um.mod.remoteId === pending.modId,
          );
          return target ? [{ ...pending, target }] : [];
        }),
      ];
      setPendingSelections(selectionRequired);
      return { ...result, selectionRequired };
    } catch (error) {
      attempt.finish(
        failureOutcome(isTauriError(error) ? error.kind : undefined),
      );
      logger.withError(error).error("Batch mod update failed");
      throw error;
    } finally {
      stopListening();
      setUpdateProgress(null);
      // A failed update leaves the previous install in place, but the download
      // events already moved these mods to Downloading/Extracting.
      usePersistedStore
        .getState()
        .restoreInterruptedUpdates(
          new Set(targets.map((um) => um.mod.remoteId)),
          activeProfile?.id,
          previousStatuses,
        );
    }
  };

  /** Returns how many mods still wait for a VPK choice. */
  const dismissSelection = (modId: string): number => {
    const pending = pendingSelections.find((p) => p.modId === modId);
    const remaining = pendingSelections.filter((p) => p.modId !== modId);
    setPendingSelections(remaining);
    if (pending) {
      toast.info(
        t("myMods.batchUpdate.selectionCanceled", { name: pending.modName }),
      );
    }
    return remaining.length;
  };

  return {
    updatableMods,
    setSelectedDownloads,
    prepareUpdates,
    executeBatchUpdate,
    updateProgress,
    pendingSelections,
    dismissSelection,
  };
};
