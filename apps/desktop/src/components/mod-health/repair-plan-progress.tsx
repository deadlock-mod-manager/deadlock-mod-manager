import { Progress } from "@deadlock-mods/ui/components/progress";
import { useTranslation } from "react-i18next";
import { useRepairPlanProgress } from "@/hooks/use-mod-health";
import { cn } from "@/lib/utils";
import type { RepairPlanStage } from "@/types/generated/RepairPlanStage";

const STAGES: readonly RepairPlanStage[] = [
  "readingGame",
  "checkingMods",
  "mergingData",
  "checkingAnimations",
  "repairingModels",
  "checkingProblems",
  "writingPackage",
];

/**
 * Shows how far the repair plan build has got. Before the first stage arrives
 * it renders nothing, or a preparing note with `showPreparing`.
 */
export const RepairPlanProgressStatus = ({
  className,
  showPreparing = false,
}: {
  className?: string;
  showPreparing?: boolean;
}) => {
  const { t } = useTranslation();
  const progress = useRepairPlanProgress((state) => state.progress);
  if (!progress) {
    return showPreparing ? (
      <p
        className={cn("text-muted-foreground text-xs leading-5", className)}
        role='status'>
        {t("modHealth.banner.preparing")}
      </p>
    ) : null;
  }
  // Each stage fills an equal share; reading mods fills its share mod by mod.
  const withinStage =
    progress.stage === "checkingMods" && progress.total > 0
      ? progress.checked / progress.total
      : 0;
  const value =
    ((STAGES.indexOf(progress.stage) + withinStage) / STAGES.length) * 100;
  const label = t(`modHealth.planProgress.${progress.stage}`, {
    checked: progress.checked + 1,
    total: progress.total,
  });

  return (
    <div className={cn("flex flex-col gap-1.5", className)} role='status'>
      <span className='text-muted-foreground text-xs leading-5 tabular-nums'>
        {label}. {t("modHealth.planProgress.mayTakeAMoment")}
      </span>
      <Progress aria-label={label} className='h-1 rounded-full' value={value} />
    </div>
  );
};
