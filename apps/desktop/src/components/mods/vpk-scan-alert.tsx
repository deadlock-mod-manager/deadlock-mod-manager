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
import { useMutation } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import { deleteProfileVpk, showProfileVpkInFolder } from "@/lib/tauri-commands";
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
  const [isListVisible, setIsListVisible] = useState(false);
  const [pendingFile, setPendingFile] = useState<string | null>(null);
  const fileListId = useId();

  const deleteAllMutation = useMutation({
    mutationFn: async (vpks: string[]) => {
      const results = await Promise.allSettled(
        vpks.map((vpk) => deleteProfileVpk(vpk, activeProfileFolder)),
      );
      const failed = results.filter((r) => r.status === "rejected");
      return { total: vpks.length, failedCount: failed.length };
    },
    onSuccess: async ({ total, failedCount }) => {
      const deletedCount = total - failedCount;
      if (failedCount === 0) {
        toast.success(
          t("mods.vpkScanAlert.deleteAllSuccess", { count: deletedCount }),
        );
      } else {
        toast.error(t("mods.vpkScanAlert.deleteAllError"));
      }
      await refetch();
    },
    onError: (error) => {
      logger.withError(error).error("Failed to delete all rogue VPKs");
      toast.error(t("mods.vpkScanAlert.deleteAllError"));
    },
  });

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

  const handleDeleteAll = async () => {
    const confirmed = await confirm({
      title: t("mods.vpkScanAlert.deleteAllConfirmTitle"),
      body: t("mods.vpkScanAlert.deleteAllConfirmBody", {
        count: unmatchedVpkCount,
      }),
      tone: "destructive",
      actionButton: t("mods.vpkScanAlert.deleteAllConfirmAction"),
      actionButtonVariant: "destructive",
    });
    if (!confirmed) return;

    deleteAllMutation.mutate(unmatchedVpks);
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className='shrink-0 overflow-hidden rounded-lg border border-border/70 bg-card/45 shadow-sm'>
        <div className='flex flex-col gap-2.5 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between'>
          <div className='flex min-w-0 items-start gap-2.5'>
            <div className='mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-background/80 text-muted-foreground ring-1 ring-border/80'>
              <PhosphorIcons.WarningCircle
                weight='duotone'
                className='h-4 w-4'
              />
            </div>
            <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
              <div className='flex min-w-0 flex-wrap items-center gap-1.5'>
                <h3 className='font-semibold text-[13px] text-foreground leading-5'>
                  {t("mods.vpkScanAlert.title")}
                </h3>
                <span className='inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-muted/50 px-1.5 font-mono font-medium text-[10px] text-muted-foreground ring-1 ring-border/70'>
                  {unmatchedVpkCount}
                </span>
              </div>
              <p className='text-muted-foreground text-xs leading-5'>
                {t("mods.vpkScanAlert.description", {
                  count: unmatchedVpkCount,
                })}
              </p>
            </div>
          </div>

          <div className='flex shrink-0 flex-wrap items-center gap-2 pl-9 sm:pl-0 sm:justify-end'>
            <AnalyzeAddonsButton
              label={t("mods.vpkScanAlert.analyzeButton")}
              size='sm'
              variant='default'
            />
            {unmatchedVpks.length > 0 && (
              <Button
                type='button'
                size='sm'
                variant='outline'
                onClick={() => setIsListVisible((v) => !v)}
                aria-expanded={isListVisible}
                aria-controls={fileListId}
                icon={
                  isListVisible ? (
                    <PhosphorIcons.CaretUp className='h-4 w-4' />
                  ) : (
                    <PhosphorIcons.CaretDown className='h-4 w-4' />
                  )
                }>
                {isListVisible
                  ? t("mods.vpkScanAlert.hideList")
                  : t("mods.vpkScanAlert.showList")}
              </Button>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type='button'
                  onClick={handleDismiss}
                  aria-label={t("mods.vpkScanAlert.dismiss")}
                  size='icon'
                  variant='ghost'
                  className='h-8 w-8 text-muted-foreground'>
                  <PhosphorIcons.X className='h-4 w-4' />
                </Button>
              </TooltipTrigger>
              <TooltipContent side='left'>
                {t("mods.vpkScanAlert.dismissTooltip")}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {unmatchedVpks.length > 0 && isListVisible && (
          <div
            id={fileListId}
            className='border-border/70 border-t bg-background/40 p-3 pt-2'>
            <div className='flex flex-col gap-2'>
              <ul className='flex max-h-56 flex-col overflow-y-auto rounded-md border border-border bg-background'>
                {unmatchedVpks.map((vpk, idx) => {
                  const isPending = pendingFile === vpk;
                  return (
                    <li
                      key={vpk}
                      className={cn(
                        "group flex min-h-9 items-center gap-2 px-2.5 py-1.5 transition-colors hover:bg-muted/50",
                        idx !== unmatchedVpks.length - 1 &&
                          "border-border/60 border-b",
                        isPending && "opacity-50",
                      )}>
                      <PhosphorIcons.FileArchive
                        weight='duotone'
                        className='h-4 w-4 shrink-0 text-muted-foreground'
                      />
                      <span
                        className='min-w-0 flex-1 truncate font-mono text-foreground/90 text-xs'
                        title={vpk}>
                        {vpk}
                      </span>
                      <div className='flex shrink-0 items-center gap-1 opacity-80 transition-opacity group-hover:opacity-100'>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type='button'
                              size='icon'
                              variant='ghost'
                              className='h-8 w-8'
                              disabled={isPending}
                              onClick={() => handleOpen(vpk)}
                              aria-label={t("mods.vpkScanAlert.openInFolder")}>
                              <PhosphorIcons.FolderOpen className='h-4 w-4' />
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
                              size='icon'
                              variant='ghost'
                              className='h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive'
                              disabled={isPending}
                              isLoading={isPending}
                              onClick={() => handleDelete(vpk)}
                              aria-label={t("mods.vpkScanAlert.delete")}>
                              {!isPending && (
                                <PhosphorIcons.Trash className='h-4 w-4' />
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

              <div className='flex flex-wrap items-center justify-end gap-2'>
                <Button
                  onClick={handleRefetch}
                  size='sm'
                  variant='ghost'
                  isLoading={isRefetching}
                  icon={
                    <PhosphorIcons.ArrowClockwiseIcon className='h-4 w-4' />
                  }>
                  {t("mods.vpkScanAlert.refresh")}
                </Button>
                <Button
                  onClick={handleDeleteAll}
                  size='sm'
                  variant='destructive'
                  disabled={deleteAllMutation.isPending}
                  isLoading={deleteAllMutation.isPending}
                  icon={<PhosphorIcons.Trash className='h-4 w-4' />}>
                  {t("mods.vpkScanAlert.deleteAll")}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};
