import type { ModDto } from "@deadlock-mods/shared";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { Separator } from "@deadlock-mods/ui/components/separator";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Flag,
  RefreshCw,
} from "@deadlock-mods/ui/icons";
import { openUrl as openExternal } from "@tauri-apps/plugin-opener";
import { format } from "date-fns";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCreateReport } from "@/hooks/use-create-report";
import { useHardwareId } from "@/hooks/use-hardware-id";
import type { LocalMod } from "@/types/mods";
import { ModStatus } from "@/types/mods";

interface BrokenModDialogProps {
  mod: Pick<ModDto, "id" | "name" | "author" | "remoteId" | "remoteUpdatedAt">;
  localMod: LocalMod | undefined;
  hasUpdate: boolean;
  onTriggerUpdate: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type DialogStep = "gate" | "confirm" | "submitted";

export const BrokenModDialog = ({
  mod,
  localMod,
  hasUpdate,
  onTriggerUpdate,
  open,
  onOpenChange,
}: BrokenModDialogProps) => {
  const { t } = useTranslation();
  const { hardwareId } = useHardwareId();
  const { mutate: createReport, isPending } = useCreateReport();
  const [step, setStep] = useState<DialogStep>("gate");

  const isInstalled = localMod?.status === ModStatus.Installed;

  const handleClose = () => {
    if (isPending) return;
    setStep("gate");
    onOpenChange(false);
  };

  const handleSubmitBroken = () => {
    createReport(
      {
        modId: mod.id,
        reporterHardwareId: hardwareId || undefined,
      },
      {
        onSuccess: (response) => {
          if (response.status === "success") {
            setStep("submitted");
            toast.success(t("reports.reportSubmitted"));
          } else {
            toast.error(response.error || t("reports.reportFailed"));
          }
        },
        onError: () => {
          toast.error(t("reports.reportFailed"));
        },
      },
    );
  };

  const handleOpenGameBananaIssues = async () => {
    if (!mod.remoteId) return;
    try {
      await openExternal(`https://gamebanana.com/mods/issues/${mod.remoteId}`);
    } catch (error) {
      console.error("Failed to open GameBanana issues:", error);
      toast.error(t("notifications.failedToOpenForumPost"));
    }
  };

  const handleUpdate = () => {
    onTriggerUpdate();
    handleClose();
  };

  const renderContent = () => {
    if (step === "submitted") {
      return (
        <>
          <DialogHeader>
            <div className='flex items-center gap-2'>
              <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15'>
                <CheckCircle2 className='h-4 w-4 text-emerald-500' />
              </div>
              <DialogTitle>{t("reports.thankYou")}</DialogTitle>
            </div>
            <DialogDescription>
              {t("reports.thankYouDescription")}
            </DialogDescription>
          </DialogHeader>

          {mod.remoteId && (
            <>
              <Separator />
              <div className='space-y-3'>
                <p className='text-sm text-muted-foreground'>
                  {t("reports.reportToDevs")}
                </p>
                <Button
                  variant='outline'
                  className='w-full justify-start'
                  icon={<ExternalLink className='h-4 w-4' />}
                  onClick={handleOpenGameBananaIssues}>
                  {t("reports.openGameBananaIssues")}
                </Button>
              </div>
            </>
          )}

          <DialogFooter>
            <Button onClick={handleClose} className='w-full'>
              {t("common.close")}
            </Button>
          </DialogFooter>
        </>
      );
    }

    if (!isInstalled) {
      return (
        <>
          <DialogHeader>
            <div className='flex items-center gap-2'>
              <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/15'>
                <Flag className='h-4 w-4 text-destructive' />
              </div>
              <DialogTitle>{t("reports.isModBroken")}</DialogTitle>
            </div>
          </DialogHeader>

          <p className='text-sm text-muted-foreground'>
            {t("reports.notInstalledYet")}
          </p>

          <DialogFooter>
            <Button onClick={handleClose} variant='outline'>
              {t("common.close")}
            </Button>
          </DialogFooter>
        </>
      );
    }

    if (hasUpdate) {
      return (
        <>
          <DialogHeader>
            <div className='flex items-center gap-2'>
              <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-yellow-500/15'>
                <AlertTriangle className='h-4 w-4 text-yellow-500' />
              </div>
              <DialogTitle>{t("reports.isModBroken")}</DialogTitle>
            </div>
            <DialogDescription>{t("reports.modOutdated")}</DialogDescription>
          </DialogHeader>

          <div className='rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4'>
            <div className='flex items-start gap-3'>
              <RefreshCw className='mt-0.5 h-4 w-4 shrink-0 text-yellow-500' />
              <div className='space-y-1'>
                <p className='text-sm font-medium'>
                  {t("reports.updateAvailable")}
                </p>
                <p className='text-sm text-muted-foreground'>
                  {t("reports.pleaseUpdate")}
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className='flex gap-2 sm:justify-between'>
            <Button variant='ghost' onClick={handleClose}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleUpdate}
              icon={<RefreshCw className='h-4 w-4' />}>
              {t("reports.updateMod")}
            </Button>
          </DialogFooter>
        </>
      );
    }

    if (step === "gate") {
      const lastUpdatedDate = new Date(mod.remoteUpdatedAt);
      const formattedDate = format(lastUpdatedDate, "PPP");

      return (
        <>
          <DialogHeader>
            <div className='flex items-center gap-2'>
              <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/15'>
                <Flag className='h-4 w-4 text-destructive' />
              </div>
              <DialogTitle>{t("reports.isModBroken")}</DialogTitle>
            </div>
          </DialogHeader>

          <div className='space-y-3'>
            <div className='flex items-center justify-between rounded-lg border bg-secondary/50 px-4 py-3'>
              <span className='text-sm text-muted-foreground'>
                {t("reports.lastUpdated")}
              </span>
              <Badge variant='outline' className='gap-1.5'>
                <AlertTriangle className='h-3 w-3 text-yellow-500' />
                {formattedDate}
              </Badge>
            </div>

            <p className='text-sm text-muted-foreground'>
              {t("reports.confirmBrokenDescription")}
            </p>
          </div>

          <DialogFooter className='flex gap-2 sm:justify-between'>
            <Button variant='ghost' onClick={handleClose}>
              {t("reports.noItsWorking")}
            </Button>
            <Button
              variant='destructive'
              onClick={handleSubmitBroken}
              disabled={isPending}
              isLoading={isPending}
              icon={<Flag className='h-4 w-4' />}>
              {t("reports.yesItsBroken")}
            </Button>
          </DialogFooter>
        </>
      );
    }

    return null;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className='sm:max-w-md'>{renderContent()}</DialogContent>
    </Dialog>
  );
};
