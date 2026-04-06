import type { ModDto } from "@deadlock-mods/shared";
import { REPORT_DISABLED_MOD_IDS } from "@deadlock-mods/shared";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { Flag } from "@deadlock-mods/ui/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useReportCounts } from "@/hooks/use-report-counts";
import type { LocalMod } from "@/types/mods";
import { BrokenModDialog } from "./report-dialog";

interface BrokenModButtonProps {
  mod: Pick<
    ModDto,
    "id" | "name" | "author" | "remoteId" | "isMap" | "remoteUpdatedAt"
  >;
  localMod: LocalMod | undefined;
  hasUpdate: boolean;
  onTriggerUpdate: () => void;
}

export const BrokenModButton = ({
  mod,
  localMod,
  hasUpdate,
  onTriggerUpdate,
}: BrokenModButtonProps) => {
  const { t } = useTranslation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { data: counts } = useReportCounts(mod.isMap ? "" : mod.id);

  if (mod.isMap || REPORT_DISABLED_MOD_IDS.has(mod.remoteId)) {
    return null;
  }

  const total = counts?.total ?? 0;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDialogOpen(true);
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant='outline' onClick={handleClick}>
            <Flag className='h-4 w-4' />
            <span>{total}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {total > 0
            ? t("reports.brokenReportsCount", { count: total })
            : t("reports.reportBroken")}
        </TooltipContent>
      </Tooltip>

      <BrokenModDialog
        mod={mod}
        localMod={localMod}
        hasUpdate={hasUpdate}
        onTriggerUpdate={onTriggerUpdate}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
      />
    </>
  );
};
