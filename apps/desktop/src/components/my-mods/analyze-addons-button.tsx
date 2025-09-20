import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAddonAnalysis } from "@/hooks/use-addon-analysis";
import { AnalysisProgressToast } from "./analysis-progress-toast";
import { AnalysisResultsDialog } from "./analysis-results-dialog";

interface AnalyzeAddonsButtonProps {
  className?: string;
}

export const AnalyzeAddonsButton = ({
  className,
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
              onClick={startAnalysis}
              disabled={isLoading}
              isLoading={isLoading}
              icon={<Search className='w-4 h-4' />}
              variant='outline'
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
