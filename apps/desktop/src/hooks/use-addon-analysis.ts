import { toast } from "@deadlock-mods/ui/components/sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAnalyticsContext } from "@/contexts/analytics-context";
import { getMod, getModDownloads } from "@/lib/api-client";
import {
  buildAnalyzedFileTree,
  needsAnalysisReview,
} from "@/lib/mods/analyzed-files";
import { invalidateModHealth } from "@/lib/mods/mod-health-queries";
import { analyzeLocalAddons } from "@/lib/tauri-commands";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import type { AddonAnalysisProgress, ModDownloadItem } from "@/types/mods";
import { getErrorMessage } from "@/lib/errors";
import type { ProfileId } from "@/types/profiles";

export const useAddonAnalysis = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { analytics } = useAnalyticsContext();
  const getActiveProfile = usePersistedStore((state) => state.getActiveProfile);
  const [progress, setProgress] = useState<AddonAnalysisProgress | null>(null);
  const [showProgressToast, setShowProgressToast] = useState(false);
  const [analysisStartTime, setAnalysisStartTime] = useState<number | null>(
    null,
  );
  const analysisResult = usePersistedStore((state) => state.analysisResult);
  const dialogOpen = usePersistedStore((state) => state.analysisDialogOpen);
  const setAnalysisResult = usePersistedStore(
    (state) => state.setAnalysisResult,
  );
  const setDialogOpen = usePersistedStore(
    (state) => state.setAnalysisDialogOpen,
  );
  const clearAnalysisDialog = usePersistedStore(
    (state) => state.clearAnalysisDialog,
  );

  const addIdentifiedLocalMod = usePersistedStore(
    (state) => state.addIdentifiedLocalMod,
  );
  const setInstalledVpks = usePersistedStore((state) => state.setInstalledVpks);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      unlisten = await listen<AddonAnalysisProgress>(
        "addon-analysis-progress",
        (event) => {
          const progressData = event.payload;
          setProgress(progressData);
          setShowProgressToast(true);

          if (progressData.step === "complete") {
            // Hide progress toast after a longer delay when complete
            setTimeout(() => {
              setShowProgressToast(false);
              setProgress(null);
            }, 3000); // 3 seconds to let user see completion
          }
        },
      );
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  const { mutate: analyzeAddons, isPending } = useMutation({
    mutationFn: ({
      profileFolder,
    }: {
      profileFolder: string | null;
      profileId: ProfileId | undefined;
    }) => analyzeLocalAddons(profileFolder),
    onSuccess: async (data, { profileFolder, profileId }) => {
      setAnalysisResult(data);

      const shouldShowDialog = needsAnalysisReview(data);
      setDialogOpen(shouldShowDialog);

      // Group addons by remoteId so multi-VPK mods are processed together
      let processedIdentifiedCount = 0;
      const registrationErrors: string[] = [];

      const modGroups = new Map<string, typeof data.addons>();
      for (const addon of data.addons) {
        if (addon.remoteId) {
          const existing = modGroups.get(addon.remoteId) ?? [];
          existing.push(addon);
          modGroups.set(addon.remoteId, existing);
        }
      }

      for (const [remoteId, groupAddons] of modGroups) {
        try {
          const modDetails = await getMod(remoteId);
          const hasMatchInfo = groupAddons.some((a) => a.matchInfo);
          const vpkFileNames = groupAddons.map((a) => a.fileName);

          if (hasMatchInfo) {
            let downloads: ModDownloadItem[] = [];
            if (groupAddons.some((addon) => addon.matchInfo?.fileId)) {
              try {
                downloads = (await getModDownloads(remoteId)).downloads;
              } catch (error) {
                logger
                  .withMetadata({ remoteId })
                  .withError(error)
                  .warn("Unable to resolve detected addon archives");
              }
            }
            const previous = usePersistedStore
              .getState()
              .localMods.find((mod) => mod.remoteId === remoteId);
            const fileTree = buildAnalyzedFileTree(
              remoteId,
              groupAddons.map((addon) => ({
                fileName: addon.fileName,
                matchInfo: addon.matchInfo,
                size: addon.vpkParsed.fingerprint.fileSize,
              })),
              downloads,
              previous?.installedFileTree,
            );
            const registration = await invoke<{
              replacedModIds: string[];
              installOrder: number | null;
            }>("register_analyzed_mod", {
              modId: remoteId,
              modName: modDetails.name,
              installedVpks: vpkFileNames,
              originalVpkNames: fileTree.files
                .filter((file) => file.is_selected)
                .map((file) => file.name),
              installedPaths: groupAddons.map((addon) => addon.filePath),
              profileFolder,
            });
            const store = usePersistedStore.getState();
            const profileGroups = profileId
              ? (store.profiles[profileId]?.modGroups ?? [])
              : [];
            const libraryGroup =
              profileGroups.find((group) => group.modIds.includes(remoteId)) ??
              profileGroups.find((group) =>
                group.modIds.some((id) =>
                  registration.replacedModIds.includes(id),
                ),
              );
            for (const alias of registration.replacedModIds) {
              store.removeMod(alias, profileId);
            }
            if ((getActiveProfile()?.folderName ?? null) === profileFolder) {
              addIdentifiedLocalMod(modDetails, groupAddons[0].filePath);
              setInstalledVpks(remoteId, vpkFileNames, fileTree);
              if (downloads.length > 0)
                store.setModDownloads(remoteId, downloads);
              store.setModEnabledInCurrentProfile(remoteId, true);
              if (registration.installOrder !== null) {
                store.setModOrder(remoteId, registration.installOrder);
              }
              if (profileId && libraryGroup) {
                store.assignModsToGroup(profileId, [remoteId], libraryGroup.id);
              }
            }
            processedIdentifiedCount++;
          } else if (
            (getActiveProfile()?.folderName ?? null) === profileFolder
          ) {
            addIdentifiedLocalMod(modDetails, "", false);
          }
        } catch (error) {
          const modName = groupAddons[0].matchInfo?.modName ?? remoteId;
          const description = getErrorMessage(error);
          registrationErrors.push(
            t("addons.registrationErrorDetail", {
              modName,
              error: description,
            }),
          );
          toast.error(t("addons.registrationError", { modName }), {
            description,
          });
          logger
            .withMetadata({ remoteId })
            .withError(error)
            .error("Failed to register analyzed addon");
        }
      }

      if (registrationErrors.length > 0) {
        setAnalysisResult({
          ...data,
          errors: [...data.errors, ...registrationErrors],
        });
        setDialogOpen(true);
      }

      await invalidateModHealth(queryClient);

      const durationSeconds = analysisStartTime
        ? (Date.now() - analysisStartTime) / 1000
        : 0;

      const totalIdentifiedCount = data.addons.filter(
        (addon) => addon.remoteId && addon.matchInfo,
      ).length;

      analytics.trackAddonAnalysisCompleted(
        data.totalCount,
        totalIdentifiedCount,
        durationSeconds,
      );

      if (data.errors.length > 0 || registrationErrors.length > 0) {
        toast.warning(
          t("addons.analysisWarning", {
            count: data.totalCount,
            errors: data.errors.length + registrationErrors.length,
          }),
        );
      } else {
        // Show different messages based on what happened
        if (processedIdentifiedCount > 0 && shouldShowDialog) {
          // Some identified, some need attention
          toast.success(
            t("addons.analysisSuccessWithIdentified", {
              count: data.totalCount,
              identified: processedIdentifiedCount,
            }),
          );
        } else if (processedIdentifiedCount > 0 && !shouldShowDialog) {
          // All identified successfully
          toast.success(
            t("addons.analysisSuccessAllIdentified", {
              count: data.totalCount,
              identified: processedIdentifiedCount,
            }),
          );
        } else {
          // No identification, but no errors
          toast.success(
            t("addons.analysisSuccess", { count: data.totalCount }),
          );
        }
      }
    },
    onError: (error) => {
      logger.withError(error).error("Failed to analyze addons");
      toast.error(t("addons.analysisError"), {
        description: getErrorMessage(error),
      });
      setShowProgressToast(false);
      setProgress(null);
    },
  });

  const startAnalysis = () => {
    setShowProgressToast(true);
    setProgress(null);
    setAnalysisStartTime(Date.now());

    clearAnalysisDialog();

    analytics.trackAddonAnalysisStarted(0);

    const activeProfile = getActiveProfile();
    const profileFolder = activeProfile?.folderName ?? null;

    analyzeAddons({ profileFolder, profileId: activeProfile?.id });
  };

  const dismissProgressToast = () => {
    setShowProgressToast(false);
    setProgress(null);
  };

  // Create a safe setDialogOpen that clears analysis when closing
  const safeSetDialogOpen = (open: boolean) => {
    if (!open) {
      // Clear both dialog and analysis result when dialog is explicitly closed
      clearAnalysisDialog();
    } else {
      setDialogOpen(open);
    }
  };

  return {
    progress,
    showProgressToast,
    analysisResult,
    dialogOpen,
    setDialogOpen: safeSetDialogOpen,
    isPending,
    startAnalysis,
    dismissProgressToast,
  };
};
