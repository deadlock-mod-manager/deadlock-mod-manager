import { Button } from "@deadlock-mods/ui/components/button";
import {
  Tooltip,
  TooltipContent,
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
  showTooltip?: boolean;
}

export const AnalyzeAddonsButton = ({
  className,
  label,
  pendingLabel,
  size,
  variant = "outline",
  showTooltip = true,
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

  const button = (
    <Button
      type='button'
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
  );

  return (
    <>
      {showTooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>
            <p>{t("addons.analyzeLocalTooltip")}</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        button
      )}

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
