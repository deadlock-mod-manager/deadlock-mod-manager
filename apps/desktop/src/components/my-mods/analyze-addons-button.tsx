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
  label?: string;
  pendingLabel?: string;
  size?: "default" | "sm" | "iconExpand" | "lg";
  variant?: "default" | "outline";
}

export const AnalyzeAddonsButton = ({
  className,
  label,
  pendingLabel,
  size,
  variant = "outline",
}: AnalyzeAddonsButtonProps) => {
  const { t } = useTranslation();
  const {
    progress,
    showProgressToast,
    analysisResult,
    dialogOpen,
    setDialogOpen,
    isPending,
    startAnalysis,
    dismissProgressToast,
  } = useAddonAnalysis();

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={variant}
              onClick={startAnalysis}
              disabled={isPending}
              isLoading={isPending}
              icon={<ScanSearch className='h-4 w-4' />}
              size={size}
              className={className}>
              {isPending
                ? (pendingLabel ?? t("addons.analyzing"))
                : (label ?? t("addons.analyzeLocal"))}
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
