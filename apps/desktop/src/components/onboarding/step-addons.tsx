import { Button } from "@deadlock-mods/ui/components/button";
import {
  CheckCircle,
  FolderOpen,
  MagnifyingGlass,
  Package,
} from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnalysisResultsDialog } from "@/components/my-mods/analysis-results-dialog";
import { analyzeLocalAddons } from "@/lib/api";
import logger from "@/lib/logger";
import type { AnalyzeAddonsResult } from "@/types/mods";

type AddonsStepProps = {
  onComplete: () => void;
};

type CheckState = "idle" | "checking" | "none" | "found" | "analyzing";

export const OnboardingStepAddons = ({ onComplete }: AddonsStepProps) => {
  const { t } = useTranslation();
  const [checkState, setCheckState] = useState<CheckState>("idle");
  const [analysisResult, setAnalysisResult] =
    useState<AnalyzeAddonsResult | null>(null);
  const [showAnalysisDialog, setShowAnalysisDialog] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const checkForAddons = useCallback(async () => {
    setCheckState("checking");
    try {
      const exists = await invoke<boolean>("check_addons_exist");
      setCheckState(exists ? "found" : "none");
      logger.info("Checked for existing addons", { exists });

      if (!exists) {
        onComplete();
      }
    } catch (error) {
      logger.error("Failed to check for addons", { error });
      setCheckState("none");
      onComplete();
    }
  }, [onComplete]);

  const handleAnalyze = async () => {
    setCheckState("analyzing");
    setIsAnalyzing(true);
    try {
      const result = await analyzeLocalAddons();
      setAnalysisResult(result);
      setShowAnalysisDialog(true);
      logger.info("Local addons analyzed", {
        count: result.addons.length,
        errors: result.errors.length,
      });
    } catch (error) {
      logger.error("Failed to analyze addons", { error });
    } finally {
      setIsAnalyzing(false);
      setCheckState("found");
    }
  };

  useEffect(() => {
    checkForAddons();
  }, [checkForAddons]);

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

          {(checkState === "found" || checkState === "analyzing") && (
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
                disabled={isAnalyzing}
                className='w-full'>
                <FolderOpen className='h-4 w-4 mr-2' />
                {isAnalyzing
                  ? t("onboarding.addons.analyzing")
                  : t("onboarding.addons.analyze")}
              </Button>
              <Button
                variant='outline'
                size='sm'
                onClick={onComplete}
                disabled={isAnalyzing}
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
