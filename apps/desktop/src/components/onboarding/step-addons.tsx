import { Button } from "@deadlock-mods/ui/components/button";
import {
  CheckCircle,
  FolderOpen,
  MagnifyingGlass,
  Package,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AnalysisResultsDialog } from "@/components/my-mods/analysis-results-dialog";
import { analyzeLocalAddons } from "@/lib/api";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import type { AnalyzeAddonsResult } from "@/types/mods";

type AddonsStepProps = {
  onComplete: () => void;
};

type CheckState = "idle" | "checking" | "none" | "found" | "analyzing";

export const OnboardingStepAddons = ({ onComplete }: AddonsStepProps) => {
  const { t } = useTranslation();
  const activeProfile = usePersistedStore((state) => {
    const { activeProfileId, profiles } = state;
    return profiles[activeProfileId];
  });
  const [analysisResult, setAnalysisResult] =
    useState<AnalyzeAddonsResult | null>(null);
  const [showAnalysisDialog, setShowAnalysisDialog] = useState(false);

  const profileFolder = activeProfile?.folderName ?? null;

  const {
    data: addonsExist,
    isPending: isChecking,
    error: checkError,
  } = useQuery({
    queryKey: ["check-addons-exist", profileFolder],
    queryFn: async () => {
      const exists = await invoke<boolean>("check_addons_exist", {
        profileFolder,
      });
      return exists;
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: analyzeLocalAddons,
    onSuccess: (result) => {
      setAnalysisResult(result);
      setShowAnalysisDialog(true);
      logger.info("Local addons analyzed", {
        count: result.addons.length,
        errors: result.errors.length,
      });
    },
    onError: (error) => {
      logger.error("Failed to analyze addons", { error });
    },
  });

  const checkState: CheckState = isChecking
    ? "checking"
    : typeof addonsExist === "boolean"
      ? addonsExist
        ? "found"
        : "none"
      : checkError
        ? "none"
        : !profileFolder
          ? "idle"
          : "idle";

  const handleAnalyze = () => {
    analyzeMutation.mutate(profileFolder);
  };

  return (
    <>
      <div className='space-y-6'>
        <div>
          <h3 className='text-lg font-semibold'>
            {t("onboarding.addons.title")}
          </h3>
          <p className='text-sm text-muted-foreground mt-2'>
            {t("onboarding.addons.description")}
          </p>
        </div>

        <div className='space-y-4'>
          {checkState === "checking" && (
            <div className='flex items-center gap-3 p-4 border rounded-lg bg-muted/50'>
              <MagnifyingGlass className='h-5 w-5 animate-pulse' />
              <span className='text-sm'>{t("onboarding.addons.checking")}</span>
            </div>
          )}

          {checkState === "none" && (
            <div className='flex items-start gap-3 p-4 border rounded-lg bg-muted/50'>
              <CheckCircle className='h-5 w-5 flex-shrink-0 mt-0.5' />
              <div className='flex-1'>
                <p className='text-sm font-medium'>
                  {t("onboarding.addons.noMods")}
                </p>
                <p className='text-xs text-muted-foreground mt-1'>
                  {t("onboarding.addons.noModsDescription")}
                </p>
              </div>
            </div>
          )}

          {(checkState === "found" || analyzeMutation.isPending) && (
            <div className='space-y-3'>
              <div className='flex items-start gap-3 p-4 border rounded-lg bg-blue-500/10 border-blue-500/20'>
                <Package className='h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5' />
                <div className='flex-1'>
                  <p className='text-sm font-medium text-blue-500'>
                    {t("onboarding.addons.modsFound")}
                  </p>
                  <p className='text-xs text-muted-foreground mt-1'>
                    {t("onboarding.addons.modsFoundDescription")}
                  </p>
                </div>
              </div>
              <Button
                variant='default'
                size='sm'
                onClick={handleAnalyze}
                disabled={analyzeMutation.isPending}
                className='w-full'>
                <FolderOpen className='h-4 w-4 mr-2' />
                {analyzeMutation.isPending
                  ? t("onboarding.addons.analyzing")
                  : t("onboarding.addons.analyze")}
              </Button>
              <Button
                variant='outline'
                size='sm'
                onClick={onComplete}
                disabled={analyzeMutation.isPending}
                className='w-full'>
                {t("onboarding.addons.skipAnalysis")}
              </Button>
            </div>
          )}
        </div>
      </div>

      <AnalysisResultsDialog
        open={showAnalysisDialog}
        onOpenChange={setShowAnalysisDialog}
        result={analysisResult}
      />
    </>
  );
};
