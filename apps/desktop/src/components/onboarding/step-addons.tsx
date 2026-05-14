import { Button } from "@deadlock-mods/ui/components/button";
import {
  CheckCircleIcon,
  FolderOpenIcon,
  MagnifyingGlassIcon,
  PackageIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AnalysisResultsDialog } from "@/components/my-mods/analysis-results-dialog";
import { analyzeLocalAddons } from "@/lib/tauri-commands";
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

  const { data: addonsExist, isPending: isChecking } = useQuery({
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
      logger
        .withMetadata({
          count: result.addons.length,
          errors: result.errors.length,
        })
        .info("Local addons analyzed");
    },
    onError: (error) => {
      logger.withError(error).error("Failed to analyze addons");
    },
  });

  const getCheckState = (): CheckState => {
    if (isChecking) return "checking";
    if (typeof addonsExist === "boolean") return addonsExist ? "found" : "none";
    return "idle";
  };

  const checkState = getCheckState();

  const handleAnalyze = () => {
    analyzeMutation.mutate(profileFolder);
  };

  return (
    <>
      <div className='space-y-5'>
        <div>
          <h3 className='font-["Forevs_Demo"] text-lg tracking-wide'>
            {t("onboarding.addons.title")}
          </h3>
          <p className='mt-2 text-sm text-muted-foreground'>
            {t("onboarding.addons.description")}
          </p>
        </div>

        <div className='space-y-3'>
          {checkState === "checking" && (
            <div className='flex items-center gap-3 rounded-lg border border-border/50 bg-muted/30 p-4'>
              <MagnifyingGlassIcon className='size-5 animate-pulse text-primary' />
              <span className='text-sm'>{t("onboarding.addons.checking")}</span>
            </div>
          )}

          {checkState === "none" && (
            <div className='rounded-lg border border-border/50 bg-muted/30 p-4'>
              <div className='flex items-center gap-2'>
                <CheckCircleIcon
                  weight='duotone'
                  className='size-5 shrink-0 text-muted-foreground'
                />
                <p className='text-sm font-medium'>
                  {t("onboarding.addons.noMods")}
                </p>
              </div>
              <p className='mt-1 pl-7 text-xs text-muted-foreground'>
                {t("onboarding.addons.noModsDescription")}
              </p>
            </div>
          )}

          {(checkState === "found" || analyzeMutation.isPending) && (
            <div className='space-y-3'>
              <div className='rounded-lg border border-primary/20 bg-primary/5 p-4'>
                <div className='flex items-center gap-2'>
                  <PackageIcon
                    weight='duotone'
                    className='size-5 shrink-0 text-primary'
                  />
                  <p className='text-sm font-medium text-primary'>
                    {t("onboarding.addons.modsFound")}
                  </p>
                </div>
                <p className='mt-1 pl-7 text-xs text-muted-foreground'>
                  {t("onboarding.addons.modsFoundDescription")}
                </p>
              </div>
              <Button
                variant='default'
                size='sm'
                onClick={handleAnalyze}
                disabled={analyzeMutation.isPending}
                className='w-full'>
                <FolderOpenIcon className='size-3.5' />
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
