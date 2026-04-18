import { Button } from "@deadlock-mods/ui/components/button";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { PhosphorIcons } from "@deadlock-mods/ui/icons";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import { deleteProfileVpk, showProfileVpkInFolder } from "@/lib/api";
import logger from "@/lib/logger";
import { AnalyzeAddonsButton } from "../my-mods/analyze-addons-button";

const DISMISS_STORAGE_KEY = "vpk-scan-alert.dismissed-fingerprint";

const fingerprint = (files: string[]) => [...files].sort().join("|");

interface VpkScanAlertProps {
  unmatchedVpkCount: number;
  unmatchedVpks: string[];
  isRefetching?: boolean;
  refetch: () => Promise<unknown>;
  activeProfileFolder?: string | null;
}

export const VpkScanAlert = ({
  unmatchedVpkCount,
  unmatchedVpks,
  isRefetching = false,
  refetch,
  activeProfileFolder = null,
}: VpkScanAlertProps) => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [dismissedFingerprint, setDismissedFingerprint] = useState<
    string | null
  >(() => window.localStorage.getItem(DISMISS_STORAGE_KEY));
  const [isListVisible, setIsListVisible] = useState(true);
  const [pendingFile, setPendingFile] = useState<string | null>(null);

  const currentFingerprint = useMemo(
    () => fingerprint(unmatchedVpks),
    [unmatchedVpks],
  );

  useEffect(() => {
    if (dismissedFingerprint && dismissedFingerprint !== currentFingerprint) {
      window.localStorage.removeItem(DISMISS_STORAGE_KEY);
      setDismissedFingerprint(null);
    }
  }, [currentFingerprint, dismissedFingerprint]);

  const isDismissed =
    dismissedFingerprint !== null &&
    dismissedFingerprint === currentFingerprint;

  if (isDismissed || unmatchedVpkCount === 0) {
    return null;
  }

  const handleDismiss = () => {
    window.localStorage.setItem(DISMISS_STORAGE_KEY, currentFingerprint);
    setDismissedFingerprint(currentFingerprint);
  };

  const handleRefetch = async () => {
    await refetch();
  };

  const handleOpen = async (vpk: string) => {
    try {
      await showProfileVpkInFolder(vpk, activeProfileFolder);
    } catch (error) {
      logger.withError(error).error("Failed to open VPK in folder");
      toast.error(t("mods.vpkScanAlert.openError"));
    }
  };

  const handleDelete = async (vpk: string) => {
    const confirmed = await confirm({
      title: t("mods.vpkScanAlert.deleteConfirmTitle"),
      body: t("mods.vpkScanAlert.deleteConfirmBody", { name: vpk }),
      tone: "destructive",
      actionButton: t("mods.vpkScanAlert.deleteConfirmAction"),
      actionButtonVariant: "destructive",
    });
    if (!confirmed) return;

    setPendingFile(vpk);
    try {
      await deleteProfileVpk(vpk, activeProfileFolder);
      toast.success(t("mods.vpkScanAlert.deleteSuccess", { name: vpk }));
      await refetch();
    } catch (error) {
      logger.withError(error).error("Failed to delete VPK");
      toast.error(t("mods.vpkScanAlert.deleteError", { name: vpk }));
    } finally {
      setPendingFile(null);
    }
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className='relative my-4 overflow-hidden rounded-xl border border-border bg-muted/30 shadow-sm'>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type='button'
              onClick={handleDismiss}
              aria-label={t("mods.vpkScanAlert.dismiss")}
              className='absolute top-2.5 right-2.5 z-10 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground'>
              <PhosphorIcons.X className='h-3.5 w-3.5' />
            </button>
          </TooltipTrigger>
          <TooltipContent side='left'>
            {t("mods.vpkScanAlert.dismissTooltip")}
          </TooltipContent>
        </Tooltip>

        <div className='flex flex-col gap-4 p-4 sm:p-5'>
          <div className='flex items-start gap-3 pr-8'>
            <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground ring-1 ring-border'>
              <PhosphorIcons.Info weight='duotone' className='h-5 w-5' />
            </div>
            <div className='flex min-w-0 flex-1 flex-col gap-1'>
              <div className='flex items-center gap-2'>
                <h3 className='font-semibold text-foreground text-sm leading-tight tracking-tight'>
                  {t("mods.vpkScanAlert.title")}
                </h3>
                <span className='inline-flex h-5 items-center rounded-full bg-muted px-2 font-mono font-semibold text-[10px] text-muted-foreground ring-1 ring-border'>
                  {unmatchedVpkCount}
                </span>
              </div>
              <p className='text-muted-foreground text-xs leading-relaxed sm:text-sm'>
                {t("mods.vpkScanAlert.description", {
                  count: unmatchedVpkCount,
                })}
              </p>
            </div>
          </div>

          {unmatchedVpks.length > 0 && (
            <div className='flex flex-col gap-2'>
              <button
                type='button'
                onClick={() => setIsListVisible((v) => !v)}
                className='flex w-fit items-center gap-1 rounded-md text-muted-foreground text-xs transition-colors hover:text-foreground'>
                {isListVisible ? (
                  <PhosphorIcons.CaretUp className='h-3 w-3' />
                ) : (
                  <PhosphorIcons.CaretDown className='h-3 w-3' />
                )}
                {isListVisible
                  ? t("mods.vpkScanAlert.hideList")
                  : t("mods.vpkScanAlert.showList")}
              </button>

              {isListVisible && (
                <ul className='flex flex-col overflow-hidden rounded-lg border border-border bg-background/60'>
                  {unmatchedVpks.map((vpk, idx) => {
                    const isPending = pendingFile === vpk;
                    return (
                      <li
                        key={vpk}
                        className={cn(
                          "group flex items-center gap-2 px-3 py-2 transition-colors hover:bg-muted/50",
                          idx !== unmatchedVpks.length - 1 &&
                            "border-border/60 border-b",
                          isPending && "opacity-50",
                        )}>
                        <PhosphorIcons.FileArchive
                          weight='duotone'
                          className='h-4 w-4 shrink-0 text-muted-foreground'
                        />
                        <span className='min-w-0 flex-1 truncate font-mono text-foreground/90 text-xs'>
                          {vpk}
                        </span>
                        <div className='flex shrink-0 items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100'>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type='button'
                                size='sm'
                                variant='ghost'
                                className='h-7 w-7 p-0'
                                disabled={isPending}
                                onClick={() => handleOpen(vpk)}
                                aria-label={t(
                                  "mods.vpkScanAlert.openInFolder",
                                )}>
                                <PhosphorIcons.FolderOpen className='h-3.5 w-3.5' />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side='top'>
                              {t("mods.vpkScanAlert.openInFolder")}
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type='button'
                                size='sm'
                                variant='ghost'
                                className='h-7 w-7 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive'
                                disabled={isPending}
                                isLoading={isPending}
                                onClick={() => handleDelete(vpk)}
                                aria-label={t("mods.vpkScanAlert.delete")}>
                                {!isPending && (
                                  <PhosphorIcons.Trash className='h-3.5 w-3.5' />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side='top'>
                              {t("mods.vpkScanAlert.delete")}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          <div className='flex flex-wrap items-center justify-end gap-2 border-border/60 border-t pt-3'>
            <Button
              onClick={handleRefetch}
              size='sm'
              variant='ghost'
              isLoading={isRefetching}
              icon={<PhosphorIcons.ArrowClockwiseIcon className='h-4 w-4' />}>
              {t("mods.vpkScanAlert.refresh")}
            </Button>
            <AnalyzeAddonsButton />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};
