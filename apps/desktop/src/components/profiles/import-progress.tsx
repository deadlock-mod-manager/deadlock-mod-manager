import { CheckCircle, Download, Package } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Progress } from "@/components/ui/progress";
import type { ImportProgress } from "@/hooks/use-profile-import";

interface ImportProgressProps {
  progress: ImportProgress;
}

export const ImportProgressDisplay = ({ progress }: ImportProgressProps) => {
  const { t } = useTranslation();

  const progressPercentage =
    progress.totalMods > 0
      ? (progress.completedMods / progress.totalMods) * 100
      : 0;

  return (
    <div className='space-y-4'>
      <div className='text-center space-y-2'>
        <div className='flex items-center justify-center gap-2'>
          {progress.isDownloading && (
            <Download className='h-4 w-4 animate-pulse text-blue-500' />
          )}
          {progress.isInstalling && (
            <Package className='h-4 w-4 animate-pulse text-green-500' />
          )}
          {!progress.isDownloading && !progress.isInstalling && (
            <CheckCircle className='h-4 w-4 text-green-500' />
          )}
          <span className='text-sm font-medium'>{progress.currentStep}</span>
        </div>

        {progress.currentMod && (
          <div className='text-xs text-muted-foreground'>
            {progress.isDownloading && t("common.downloading")}:{" "}
            {progress.currentMod}
            {progress.isInstalling && t("common.installing")}:{" "}
            {progress.currentMod}
          </div>
        )}
      </div>

      <div className='space-y-2'>
        <div className='flex justify-between text-xs text-muted-foreground'>
          <span>{t("profiles.modsProcessed")}</span>
          <span>
            {progress.completedMods} / {progress.totalMods}
          </span>
        </div>
        <Progress value={progressPercentage} className='h-2' />
      </div>
    </div>
  );
};
