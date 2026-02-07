import type { ModDto } from "@deadlock-mods/shared";
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

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card navigation
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
