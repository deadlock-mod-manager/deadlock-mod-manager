import { Progress } from "@deadlock-mods/ui/components/progress";
import { useTranslation } from "react-i18next";
import type { AddonAnalysisProgress } from "@/types/mods";

interface AnalysisProgressIndicatorProps {
  progress: AddonAnalysisProgress;
  className?: string;
}

export const AnalysisProgressIndicator = ({
  progress,
  className,
}: AnalysisProgressIndicatorProps) => {
  const { t } = useTranslation();

  return (
    <div className={`space-y-2 ${className || ""}`}>
      <div className='flex items-center justify-between text-sm'>
        <span className='text-muted-foreground'>
          {t(`addons.progress.${progress.step}`, {
            defaultValue: progress.stepDescription,
          })}
        </span>
        <span className='text-muted-foreground'>{progress.totalProgress}%</span>
      </div>
      <Progress value={progress.totalProgress} className='h-2' />

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
  );
};
