import { toast } from "@deadlock-mods/ui/components/sonner";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "react-query";
import { useAnalyticsContext } from "@/contexts/analytics-context";
import { analyzeLocalAddons, getMod } from "@/lib/api";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import type { AddonAnalysisProgress } from "@/types/mods";

export const useAddonAnalysis = () => {
  const { t } = useTranslation();
  const { analytics } = useAnalyticsContext();
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

  const { mutate: analyzeAddons, isLoading } = useMutation(analyzeLocalAddons, {
    onSuccess: async (data) => {
      setAnalysisResult(data);

      // Check if there are any addons that need user attention
      const unknownAddons = data.addons.filter(
        (addon) => !addon.remoteId && addon.vpkParsed?.fingerprint,
      );
      const errorAddons = data.addons.filter(
        (addon) => !addon.vpkParsed || !addon.vpkParsed.fingerprint,
      );

      // Only show dialog if there are unidentified or error addons
      const shouldShowDialog =
        unknownAddons.length > 0 || errorAddons.length > 0;

      setDialogOpen(shouldShowDialog);

      // Process identified addons and add them to the store
      let processedIdentifiedCount = 0;
      let processedPrefixedCount = 0;
      console.log("Processing analysis results:", {
        totalAddons: data.addons.length,
        addonsWithRemoteId: data.addons.filter((a) => a.remoteId).length,
        addonsWithMatchInfo: data.addons.filter((a) => a.matchInfo).length,
      });

      for (const addon of data.addons) {
        if (addon.remoteId) {
          try {
            // Fetch full mod details from API using the mod's remote ID
            const modDetails = await getMod(addon.remoteId);

            if (addon.matchInfo) {
              // This is a fully identified mod (has matchInfo) - add as installed
              addIdentifiedLocalMod(modDetails, addon.filePath);
              processedIdentifiedCount++;
            } else {
              // This is a prefixed VPK (no matchInfo) - add as downloaded but not installed
              // Path can be empty since install_mod will find and rename the prefixed VPKs in addons
              addIdentifiedLocalMod(modDetails, "", false);
              processedPrefixedCount++;
            }
          } catch (error) {
            logger.error(
              `Failed to fetch mod details for ${addon.remoteId}:`,
              error,
            );
          }
        }
      }

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

      if (data.errors.length > 0) {
        toast.warning(
          t("addons.analysisWarning", {
            count: data.totalCount,
            errors: data.errors.length,
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
      logger.error("Failed to analyze addons:", error);
      toast.error(t("addons.analysisError"));
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

    analyzeAddons();
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
    isLoading,
    startAnalysis,
    dismissProgressToast,
  };
};
