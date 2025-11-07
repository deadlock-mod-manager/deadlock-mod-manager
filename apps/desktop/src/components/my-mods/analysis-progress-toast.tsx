import { Button } from "@deadlock-mods/ui/components/button";
import { Progress } from "@deadlock-mods/ui/components/progress";
import { Loader2, X } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import type { AddonAnalysisProgress } from "@/types/mods";

interface AnalysisProgressToastProps {
  progress: AddonAnalysisProgress;
  isVisible: boolean;
  onDismiss?: () => void;
}

export const AnalysisProgressToast = ({
  progress,
  isVisible,
  onDismiss,
}: AnalysisProgressToastProps) => {
  const { t } = useTranslation();

  if (!isVisible) return null;

  return (
    <div className='fixed bottom-10 text-foreground right-16 z-50 w-80 bg-background border border-border rounded-lg shadow-lg animate-in slide-in-from-bottom-2 fade-in-0 duration-300'>
      <div className='p-4'>
        <div className='flex items-center justify-between mb-3'>
          <div className='flex items-center gap-2'>
            <Loader2 className='w-4 h-4 animate-spin' />
            <h3 className='font-medium text-sm'>
              {t("addons.analysisResults")}
            </h3>
          </div>
          {onDismiss && progress.step === "complete" && (
            <Button
              variant='ghost'
              size='sm'
              className='h-6 w-6 p-0 hover:bg-muted'
              onClick={onDismiss}>
              <X className='w-3 h-3' />
            </Button>
          )}
        </div>

        <div className='space-y-2'>
          <div className='flex items-center justify-between text-sm'>
            <span className='text-muted-foreground'>
              {t(`addons.progress.${progress.step}`, {
                defaultValue: progress.stepDescription,
              })}
            </span>
            <span className='text-muted-foreground font-medium'>
              {progress.totalProgress}%
            </span>
          </div>

          <Progress value={progress.totalProgress} className='h-2' />

          <div className='space-y-1'>
            {progress.filesFound && (
              <div className='text-xs text-muted-foreground'>
                {t("addons.progressDetails.filesFound", {
                  count: progress.filesFound,
                })}
              </div>
            )}
            {progress.currentFile && progress.filesFound && (
              <div className='text-xs text-muted-foreground'>
                {t("addons.progressDetails.currentFile", {
                  current: progress.currentFile,
                  total: progress.filesFound,
                })}
              </div>
            )}
            {progress.currentFileName && (
              <div className='text-xs text-muted-foreground truncate'>
                {t("addons.progressDetails.currentFileName", {
                  fileName: progress.currentFileName,
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
