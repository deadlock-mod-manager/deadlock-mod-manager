import type { ModDto } from "@deadlock-mods/shared";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { BatchUpdateResultSchema } from "@/lib/validation/batch-update";
import type {
  BatchUpdateProgressEvent,
  ModDownloadItem,
  ModFileTree,
  ProfileImportMod,
  UpdateProgress,
  UpdatableMod,
} from "@/types/mods";
import { ModStatus } from "@/types/mods";

export const useBatchUpdate = () => {
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(
    null,
  );
  const [updatableMods, setUpdatableMods] = useState<UpdatableMod[]>([]);
  const { t } = useTranslation();
  const { getActiveProfile, setInstalledVpks, localMods } = usePersistedStore();

  useEffect(() => {
    const unlistenPromise = listen<BatchUpdateProgressEvent>(
      "batch-update-progress",
      (event) => {
        const progress = event.payload;
        setUpdateProgress({
          currentStep: progress.currentStep,
          currentMod: progress.currentModName || undefined,
          completedMods: progress.currentModIndex,
          totalMods: progress.totalMods,
          overallProgress: progress.overallProgress,
          isDownloading: progress.currentStep === "downloading",
          isInstalling: progress.currentStep === "installing",
        });
      },
    );

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const prepareUpdates = (
    updates: Array<{ mod: ModDto; downloads: ModDownloadItem[] }>,
  ) => {
    const prepared = updates.map((update) => {
      const localMod = localMods.find(
        (m) => m.remoteId === update.mod.remoteId,
      );

      let selectedDownload: ModDownloadItem | undefined;
      if (update.downloads.length === 1) {
        selectedDownload = update.downloads[0];
      } else if (localMod?.selectedDownload) {
        selectedDownload =
          update.downloads.find(
            (d) => d.name === localMod.selectedDownload!.name,
          ) || update.downloads[0];
      } else {
        selectedDownload = update.downloads[0];
      }

      return {
        mod: update.mod,
        downloads: update.downloads,
        selectedDownload,
        selectedFileTree: localMod?.installedFileTree,
      };
    });

    setUpdatableMods(prepared);
    return prepared;
  };

  const setSelectedDownload = (remoteId: string, download: ModDownloadItem) => {
    setUpdatableMods((mods) =>
      mods.map((m) =>
        m.mod.remoteId === remoteId ? { ...m, selectedDownload: download } : m,
      ),
    );
  };

  const setSelectedFileTree = (remoteId: string, fileTree: ModFileTree) => {
    setUpdatableMods((mods) =>
      mods.map((m) =>
        m.mod.remoteId === remoteId ? { ...m, selectedFileTree: fileTree } : m,
      ),
    );
  };

  const executeBatchUpdate = async (): Promise<void> => {
    const activeProfile = getActiveProfile();
    const profileFolder = activeProfile?.folderName ?? "";

    logger
      .withMetadata({
        modsCount: updatableMods.length,
        profileFolder,
      })
      .info("Starting batch mod update");

    setUpdateProgress({
      currentStep: t("myMods.batchUpdate.updating"),
      completedMods: 0,
      totalMods: updatableMods.length,
      overallProgress: 0,
      isDownloading: false,
      isInstalling: false,
    });

    const batchUpdateMods: ProfileImportMod[] = updatableMods.map((um) => ({
      modId: um.mod.remoteId,
      modName: um.mod.name,
      downloadFiles: um.selectedDownload
        ? [
            {
              url: um.selectedDownload.url,
              name: um.selectedDownload.name,
              size: um.selectedDownload.size,
            },
          ]
        : um.downloads.map((d) => ({
            url: d.url,
            name: d.name,
            size: d.size,
          })),
      fileTree: um.selectedFileTree,
    }));

    try {
      const rawResult = await invoke("batch_update_mods", {
        mods: batchUpdateMods,
        profileFolder,
      });

      const result = BatchUpdateResultSchema.parse(rawResult);

      for (const installedModInfo of result.installedMods) {
        const updatableMod = updatableMods.find(
          (m) => m.mod.remoteId === installedModInfo.modId,
        );

        if (updatableMod) {
          setInstalledVpks(
            installedModInfo.modId,
            installedModInfo.installedVpks,
            installedModInfo.fileTree,
          );

          usePersistedStore.setState((state) => ({
            localMods: state.localMods.map((mod) =>
              mod.remoteId === installedModInfo.modId
                ? {
                    ...mod,
                    downloadedAt: new Date(),
                    status: ModStatus.Installed,
                  }
                : mod,
            ),
          }));
        }
      }

      setUpdateProgress(null);

      if (result.failed.length > 0) {
        logger
          .withMetadata({
            failed: result.failed.length,
            succeeded: result.succeeded.length,
          })
          .warn("Some mods failed to update");
        toast.warning(
          t("myMods.batchUpdate.partialSuccess", {
            succeeded: result.succeeded.length,
            failed: result.failed.length,
          }),
        );
      } else {
        toast.success(t("myMods.batchUpdate.complete"));
      }
    } catch (error) {
      logger
        .withError(error instanceof Error ? error : new Error(String(error)))
        .error("Batch mod update failed");
      setUpdateProgress(null);
      toast.error(t("myMods.batchUpdate.error"));
      throw error;
    }
  };

  return {
    updatableMods,
    setSelectedDownload,
    setSelectedFileTree,
    prepareUpdates,
    executeBatchUpdate,
    updateProgress,
  };
};
