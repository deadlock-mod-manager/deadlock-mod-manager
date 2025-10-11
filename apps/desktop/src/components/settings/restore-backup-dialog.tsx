import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { Label } from "@deadlock-mods/ui/components/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@deadlock-mods/ui/components/radio-group";
import { ArrowsClockwise, TrashIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { RestoreStrategy } from "@/types/backup";

interface RestoreBackupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (strategy: RestoreStrategy) => void;
  backupFileName: string;
}

export const RestoreBackupDialog = ({
  open,
  onOpenChange,
  onConfirm,
  backupFileName,
}: RestoreBackupDialogProps) => {
  const { t } = useTranslation();
  const [strategy, setStrategy] = useState<RestoreStrategy>("replace");

  const handleConfirm = () => {
    onConfirm(strategy);
    onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("settings.restoreBackup")}</DialogTitle>
          <DialogDescription>
            {t("settings.restoreStrategyWarning")}
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4 py-4'>
          <div className='space-y-2'>
            <Label className='text-sm font-medium'>
              {t("settings.restoreStrategy")}
            </Label>

            <RadioGroup
              value={strategy}
              onValueChange={(value) => setStrategy(value as RestoreStrategy)}>
              <div className='space-y-3'>
                <div className='flex items-start space-x-3 rounded-lg border p-4 hover:bg-accent'>
                  <RadioGroupItem
                    value='replace'
                    id='replace'
                    className='mt-1'
                  />
                  <div className='flex-1 space-y-1'>
                    <Label
                      htmlFor='replace'
                      className='flex items-center gap-2 font-medium cursor-pointer'>
                      <TrashIcon className='h-4 w-4 text-destructive' />
                      {t("settings.restoreStrategyReplace")}
                    </Label>
                    <p className='text-muted-foreground text-sm'>
                      Removes all current addons before restoring the backup.
                      Ensures a clean state matching the backup exactly.
                    </p>
                  </div>
                </div>

                <div className='flex items-start space-x-3 rounded-lg border p-4 hover:bg-accent'>
                  <RadioGroupItem value='merge' id='merge' className='mt-1' />
                  <div className='flex-1 space-y-1'>
                    <Label
                      htmlFor='merge'
                      className='flex items-center gap-2 font-medium cursor-pointer'>
                      <ArrowsClockwise className='h-4 w-4 text-primary' />
                      {t("settings.restoreStrategyMerge")}
                    </Label>
                    <p className='text-muted-foreground text-sm'>
                      Restores backup files while keeping existing addons. Files
                      with the same name will be overwritten.
                    </p>
                  </div>
                </div>
              </div>
            </RadioGroup>
          </div>

          <div className='rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3'>
            <p className='text-sm'>
              <strong>Restoring:</strong> {backupFileName}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleConfirm}>{t("settings.restoreBackup")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
