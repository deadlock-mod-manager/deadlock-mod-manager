import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { useTranslation } from "react-i18next";
import { CrosshairForm } from "./crosshair-form";

export interface CrosshairDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CrosshairDialog = ({
  open,
  onOpenChange,
}: CrosshairDialogProps) => {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-5xl '>
        <DialogHeader>
          <DialogTitle>{t("crosshairs.dialog.title")}</DialogTitle>
          <DialogDescription>
            {t("crosshairs.dialog.description")}
          </DialogDescription>
        </DialogHeader>
        <CrosshairForm />
      </DialogContent>
    </Dialog>
  );
};
