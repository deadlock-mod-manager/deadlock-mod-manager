import { CloudArrowDown } from "@phosphor-icons/react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { Update } from "@tauri-apps/plugin-updater";
import { useTranslation } from "react-i18next";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

type UpdateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  update: Update | null;
  isDownloading: boolean;
  downloadProgress: number;
  onUpdate: () => void;
};

export const UpdateDialog = ({
  open,
  onOpenChange,
  update,
  isDownloading,
  downloadProgress,
  onUpdate,
}: UpdateDialogProps) => {
  const { t } = useTranslation();

  if (!update) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-[425px]'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <CloudArrowDown className='h-5 w-5' />
            {t("update.available")}
          </DialogTitle>
          <DialogDescription>
            {t("update.newVersionAvailable", {
              version: update.version,
              currentVersion: update.currentVersion,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className='py-4'>
          {update.body && (
            <div className='rounded-md bg-muted p-4'>
              <h4 className='mb-2 font-medium text-sm'>
                {t("update.releaseNotes")}
              </h4>
              <div className='max-h-48 overflow-y-auto text-muted-foreground text-sm'>
                {update.body}
              </div>
            </div>
          )}

          {isDownloading && (
            <div className='mt-4 space-y-2'>
              <div className='flex items-center justify-between text-sm'>
                <span>{t("update.downloading")}</span>
                <span>{downloadProgress}%</span>
              </div>
              <Progress value={downloadProgress} />
            </div>
          )}
        </div>

        <DialogFooter>
          {!isDownloading && (
            <>
              <DialogPrimitive.Close
                className={buttonVariants({ variant: "outline" })}
                type='button'>
                {t("update.later")}
              </DialogPrimitive.Close>
              <Button onClick={onUpdate} type='button'>
                <CloudArrowDown className='mr-2 h-4 w-4' />
                {t("update.downloadAndInstall")}
              </Button>
            </>
          )}
          {isDownloading && (
            <Button disabled type='button' variant='secondary'>
              {t("update.installing")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
