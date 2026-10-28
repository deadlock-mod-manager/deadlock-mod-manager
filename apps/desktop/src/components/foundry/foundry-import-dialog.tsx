import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { useTranslation } from "react-i18next";
import { FoundrySkinPicker } from "./foundry-skin-picker";

interface FoundryImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** "Change skin" from inside the workspace: the start page's picker. */
export const FoundryImportDialog = ({
  open,
  onOpenChange,
}: FoundryImportDialogProps) => {
  const { t } = useTranslation();

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className='flex h-[80vh] max-w-4xl flex-col gap-0 overflow-hidden p-0'>
        <DialogHeader className='shrink-0 space-y-1.5 border-b p-6 pb-4'>
          <DialogTitle>{t("foundry.import.dialogTitle")}</DialogTitle>
          <DialogDescription>{t("foundry.picker.subtitle")}</DialogDescription>
        </DialogHeader>
        <FoundrySkinPicker
          className='flex-1 p-6 pt-4'
          onOpened={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
};
