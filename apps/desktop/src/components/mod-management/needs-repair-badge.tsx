import { Badge } from "@deadlock-mods/ui/components/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { AlertTriangle, CircleHelp } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { RepairReason } from "@/types/mods";

type NeedsRepairBadgeProps = {
  className?: string;
  reason?: RepairReason;
};

const manualChoiceReasons = new Set<RepairReason>([
  "needsDownloadChoice",
  "needsFileSelection",
]);

export const NeedsRepairBadge = ({
  className,
  reason,
}: NeedsRepairBadgeProps) => {
  const { t } = useTranslation();
  const needsChoice = reason ? manualChoiceReasons.has(reason) : false;
  const Icon = needsChoice ? CircleHelp : AlertTriangle;
  const tooltip = reason
    ? t(`modStatus.repairReason.${reason}`)
    : t("modStatus.needsRepairTooltip");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant='outline'
          className={cn(
            "border-amber-500/50 bg-amber-500/15 text-amber-800 hover:bg-amber-500/20 dark:text-amber-300",
            className,
          )}>
          <Icon className='h-3 w-3' />
          {t("modStatus.needsRepair")}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
};
