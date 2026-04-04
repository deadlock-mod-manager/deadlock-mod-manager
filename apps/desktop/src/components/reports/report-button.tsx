import type { ModDto } from "@deadlock-mods/shared";
import { REPORT_DISABLED_MOD_IDS } from "@deadlock-mods/shared";
import { Button } from "@deadlock-mods/ui/components/button";
import { Flag } from "@deadlock-mods/ui/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ReportDialog } from "./report-dialog";

interface ReportButtonProps {
  mod: Pick<ModDto, "id" | "name" | "author" | "remoteId">;
}

export const ReportButton = ({ mod }: ReportButtonProps) => {
  const { t } = useTranslation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  if (REPORT_DISABLED_MOD_IDS.has(mod.remoteId)) {
    return null;
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDialogOpen(true);
  };

  return (
    <>
      <Button
        variant='destructiveOutline'
        onClick={handleClick}
        icon={<Flag className='h-4 w-4 mr-2' />}>
        {t("reports.reportMod")}
      </Button>

      <ReportDialog
        mod={mod}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
      />
    </>
  );
};
