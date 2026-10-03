import { Button } from "@deadlock-mods/ui/components/button";
import { Checkbox } from "@deadlock-mods/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { Progress } from "@deadlock-mods/ui/components/progress";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { CheckCircle, FolderOpen } from "@deadlock-mods/ui/icons";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type ExportSelection,
  useExportInterchangeBundle,
} from "@/hooks/use-mod-interchange";
import { getErrorMessage } from "@/lib/errors";
import type {
  InterchangeExportReport,
  InterchangeProgress,
} from "@/lib/mod-interchange";
import { usePersistedStore } from "@/lib/store";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Export for other mod managers: choose what to include, where to save,
 *  watch it copy, then open the result. */
export const ExportDialog = ({ open, onOpenChange }: ExportDialogProps) => {
  const { t } = useTranslation();
  const exportBundle = useExportInterchangeBundle();
  const profileCount = usePersistedStore(
    (state) => Object.keys(state.profiles).length,
  );
  const crosshairCount = usePersistedStore(
    (state) =>
      (state.activeCrosshair ? 1 : 0) + state.activeCrosshairHistory.length,
  );
  const [selection, setSelection] = useState<ExportSelection>({
    profiles: true,
    crosshairs: true,
  });
  const [progress, setProgress] = useState<InterchangeProgress | null>(null);
  const [report, setReport] = useState<InterchangeExportReport | null>(null);

  useEffect(() => {
    if (open) {
      setReport(null);
      setProgress(null);
    }
  }, [open]);

  const run = async () => {
    const destination = await openDialog({
      directory: true,
      multiple: false,
      title: t("interchange.exportPickFolder"),
    });
    if (typeof destination !== "string") return;
    exportBundle.mutate(
      { destinationDir: destination, selection, onProgress: setProgress },
      {
        onSuccess: setReport,
        onError: (error) =>
          toast.error(
            t("interchange.exportFailed", { error: getErrorMessage(error) }),
          ),
      },
    );
  };

  const percent =
    progress && progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

  return (
    <Dialog
      onOpenChange={exportBundle.isPending ? undefined : onOpenChange}
      open={open}>
      <DialogContent
        className='max-w-lg'
        data-testid='interchange-export-dialog'>
        <DialogHeader>
          <DialogTitle>{t("interchange.exportTitle")}</DialogTitle>
          <DialogDescription>
            {t("interchange.exportDescription")}
          </DialogDescription>
        </DialogHeader>

        {!report && !exportBundle.isPending && (
          <div className='space-y-2'>
            <label className='flex items-start gap-3 rounded-lg border p-3 opacity-80'>
              <Checkbox checked disabled />
              <div>
                <p className='font-medium text-sm'>
                  {t("interchange.sectionMods")}
                </p>
                <p className='text-muted-foreground text-xs'>
                  {t("interchange.exportModsDetail")}
                </p>
              </div>
            </label>
            <label className='flex cursor-pointer items-start gap-3 rounded-lg border p-3'>
              <Checkbox
                checked={selection.profiles}
                onCheckedChange={(v) =>
                  setSelection((s) => ({ ...s, profiles: v === true }))
                }
              />
              <div>
                <p className='font-medium text-sm'>
                  {t("interchange.sectionProfiles")}
                </p>
                <p className='text-muted-foreground text-xs'>
                  {t("interchange.exportProfilesDetail", {
                    count: profileCount,
                  })}
                </p>
              </div>
            </label>
            <label className='flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:disabled]:opacity-60'>
              <Checkbox
                checked={selection.crosshairs && crosshairCount > 0}
                disabled={crosshairCount === 0}
                onCheckedChange={(v) =>
                  setSelection((s) => ({ ...s, crosshairs: v === true }))
                }
              />
              <div>
                <p className='font-medium text-sm'>
                  {t("interchange.sectionCrosshairs")}
                </p>
                <p className='text-muted-foreground text-xs'>
                  {t("interchange.sectionCrosshairsDetail", {
                    count: crosshairCount,
                  })}
                </p>
              </div>
            </label>
          </div>
        )}

        {exportBundle.isPending && (
          <div className='space-y-3 py-2'>
            <Progress value={percent} />
            <p className='text-muted-foreground text-sm'>
              {progress?.name
                ? t("interchange.exportingMod", {
                    name: progress.name,
                    current: progress.current + 1,
                    total: progress.total,
                  })
                : t("interchange.progress.starting")}
            </p>
          </div>
        )}

        {report && (
          <div className='space-y-2 text-sm'>
            <div className='flex items-center gap-2 font-medium'>
              <CheckCircle className='h-5 w-5 text-green-600' />
              {t("interchange.exportedSummary", {
                mods: report.exported,
                profiles: report.profiles,
                crosshairs: report.crosshairs,
              })}
            </div>
            <p className='break-all text-muted-foreground'>
              {report.bundlePath}
            </p>
            {report.skipped.length > 0 && (
              <ul className='list-disc pl-5 text-muted-foreground'>
                {report.skipped.map((s) => (
                  <li key={s.modId}>
                    {s.name}: {s.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <DialogFooter className='gap-2'>
          {report ? (
            <>
              <Button
                icon={<FolderOpen className='h-4 w-4' />}
                onClick={() =>
                  void invoke("show_in_folder", { path: report.bundlePath })
                }
                variant='outline'>
                {t("interchange.openFolder")}
              </Button>
              <Button onClick={() => onOpenChange(false)}>
                {t("common.close")}
              </Button>
            </>
          ) : (
            <Button
              disabled={exportBundle.isPending}
              isLoading={exportBundle.isPending}
              onClick={() => void run()}>
              {t("interchange.chooseFolderAndExport")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
