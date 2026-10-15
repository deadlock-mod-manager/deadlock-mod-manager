import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { WrenchIcon } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getErrorMessage } from "@/lib/errors";
import { invokeGuarded } from "@/lib/game-guard";
import logger from "@/lib/logger";
import { repairManifestEntries } from "@/lib/mod-folder-repair";
import { usePersistedStore } from "@/lib/store";
import type { ModFolderRepairReport } from "@/types/generated/ModFolderRepairReport";

export const RepairModFolder = () => {
  const { t } = useTranslation();
  const [report, setReport] = useState<ModFolderRepairReport | null>(null);
  const repair = useMutation({
    mutationFn: async (dryRun: boolean) => {
      const store = usePersistedStore.getState();
      const profile = store.getActiveProfile();
      if (!profile) return null;
      const result = await invokeGuarded<ModFolderRepairReport>(
        "repair_mod_folder",
        {
          profileFolder: profile.folderName,
          entries: repairManifestEntries(profile),
          dryRun,
        },
      );
      if (!dryRun) {
        await store.restoreModsFromManifest();
        await store.syncProfileEnabledMods(profile.id);
      }
      return result;
    },
    onSuccess: setReport,
    onError: (error) => {
      logger.withError(error).error("Mod folder repair failed");
      toast.error(
        t("repairModFolder.failed", { reason: getErrorMessage(error) }),
      );
    },
    meta: { skipGlobalErrorHandler: true },
  });

  return (
    <>
      <Button
        className='w-fit'
        variant='outline'
        disabled={repair.isPending}
        onClick={() => repair.mutate(true)}>
        <WrenchIcon className='size-4' />
        {t(
          repair.isPending
            ? "repairModFolder.working"
            : "repairModFolder.action",
        )}
      </Button>
      <Dialog
        open={report !== null}
        onOpenChange={(open) => {
          if (!open && !repair.isPending) setReport(null);
        }}>
        <DialogContent className='max-h-[85vh] overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>
              {t(
                report?.applied
                  ? "repairModFolder.resultTitle"
                  : "repairModFolder.action",
              )}
            </DialogTitle>
            <DialogDescription>
              {t(
                report?.applied
                  ? "repairModFolder.resultDescription"
                  : "repairModFolder.previewDescription",
              )}
            </DialogDescription>
          </DialogHeader>
          {report && (
            <div className='space-y-3 text-sm' data-testid='repair-report'>
              <p>
                {t(`repairModFolder.manifest.${report.manifestStatus}`, {
                  context: report.applied ? "applied" : "preview",
                })}
              </p>
              <p>
                {t(
                  report.applied
                    ? "repairModFolder.backedUp"
                    : "repairModFolder.untracked",
                  { count: report.untrackedFiles.length },
                )}
              </p>
              {report.untrackedFiles.length > 0 && (
                <ul className='max-h-48 space-y-1 overflow-y-auto rounded-md border p-3 font-mono text-xs'>
                  {report.untrackedFiles.map((file) => (
                    <li className='break-all' key={file}>
                      {file}
                    </li>
                  ))}
                </ul>
              )}
              <p>{t("repairModFolder.restoreInstructions")}</p>
              {report.backupPath && (
                <p className='break-all font-mono text-xs'>
                  {report.backupPath}
                </p>
              )}
              {report.corruptManifestBackup && (
                <p className='break-all font-mono text-xs'>
                  {report.corruptManifestBackup}
                </p>
              )}
              <p>
                {t("repairModFolder.staging", {
                  count: report.staging.length,
                  context: report.applied ? "applied" : "preview",
                })}
              </p>
              {report.staging.map((folder) => (
                <p className='break-all font-mono text-xs' key={folder}>
                  {folder}
                </p>
              ))}
              {report.quarantinedStaging.length > 0 && (
                <>
                  <p>{t("repairModFolder.quarantinedStaging")}</p>
                  {report.quarantinedStaging.map((folder) => (
                    <p className='break-all font-mono text-xs' key={folder}>
                      {folder}
                    </p>
                  ))}
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant='outline'
              disabled={repair.isPending}
              onClick={() => setReport(null)}>
              {t(report?.applied ? "common.close" : "common.cancel")}
            </Button>
            {!report?.applied && (
              <Button
                disabled={repair.isPending}
                onClick={() => repair.mutate(false)}>
                {t(
                  repair.isPending
                    ? "repairModFolder.working"
                    : "repairModFolder.apply",
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
