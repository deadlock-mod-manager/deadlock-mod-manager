import type { ModDto } from "@deadlock-mods/shared";
import { Flag } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ReportDialog } from "./report-dialog";

interface ReportButtonProps {
  mod: Pick<ModDto, "id" | "name" | "author">;
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
        variant='outline'
        onClick={handleClick}
        className='text-destructive'
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
