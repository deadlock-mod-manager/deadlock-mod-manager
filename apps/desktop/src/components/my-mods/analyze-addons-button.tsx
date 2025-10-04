import { Button } from "@deadlock-mods/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { ScanSearch } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { useAddonAnalysis } from "@/hooks/use-addon-analysis";
import { AnalysisProgressToast } from "./analysis-progress-toast";
import { AnalysisResultsDialog } from "./analysis-results-dialog";

interface AnalyzeAddonsButtonProps {
  className?: string;
  size?: "default" | "iconExpand";
}

export const AnalyzeAddonsButton = ({
  className,
  size,
}: AnalyzeAddonsButtonProps) => {
  const { t } = useTranslation();
  const {
    progress,
    showProgressToast,
    analysisResult,
    dialogOpen,
    setDialogOpen,
    isLoading,
    startAnalysis,
    dismissProgressToast,
  } = useAddonAnalysis();

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant='outline'
              onClick={startAnalysis}
              disabled={isLoading}
              isLoading={isLoading}
              icon={<ScanSearch className='w-4 h-4' />}
              size={size}
              className={className}>
              {isLoading ? t("addons.analyzing") : t("addons.analyzeLocal")}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t("addons.analyzeLocalTooltip")}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {progress && (
        <AnalysisProgressToast
          progress={progress}
          isVisible={showProgressToast}
          onDismiss={dismissProgressToast}
        />
      )}

      <AnalysisResultsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        result={analysisResult}
      />
    </>
  );
};
