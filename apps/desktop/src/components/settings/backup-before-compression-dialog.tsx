import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@deadlock-mods/ui/components/alert-dialog";
import { Button } from "@deadlock-mods/ui/components/button";
import { Checkbox } from "@deadlock-mods/ui/components/checkbox";
import { Label } from "@deadlock-mods/ui/components/label";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type BackupBeforeCompressionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (createBackup: boolean) => void;
};

export const BackupBeforeCompressionDialog = ({
  open,
  onOpenChange,
  onConfirm,
}: BackupBeforeCompressionDialogProps) => {
  const { t } = useTranslation();
  const [createBackup, setCreateBackup] = useState(true);

  useEffect(() => {
    if (open) {
      setCreateBackup(true);
    }
  }, [open]);

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent className='sm:max-w-md'>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("settings.modCompression.backupPrompt.title")}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className='space-y-4 pt-2'>
              <p className='text-muted-foreground text-sm'>
                {t("settings.modCompression.backupPrompt.body")}
              </p>
              <div className='flex items-start gap-3'>
                <Checkbox
                  checked={createBackup}
                  id='backup-before-compression-checkbox'
                  onCheckedChange={(v) => setCreateBackup(v === true)}
                />
                <Label
                  className='cursor-pointer font-normal leading-tight'
                  htmlFor='backup-before-compression-checkbox'>
                  {t("settings.modCompression.backupPrompt.createBackupOption")}
                </Label>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            type='button'
            variant='outline'>
            {t("settings.modCompression.backupPrompt.cancel")}
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              onConfirm(createBackup);
            }}
            type='button'
            variant='default'>
            {t("settings.modCompression.backupPrompt.confirmEnable")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
