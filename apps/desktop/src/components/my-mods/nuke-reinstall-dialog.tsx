import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { Progress } from "@deadlock-mods/ui/components/progress";
import { ScrollArea } from "@deadlock-mods/ui/components/scroll-area";
import {
  CheckCircle2,
  CircleDashed,
  HardDrive,
  Loader2,
  XCircle,
} from "@deadlock-mods/ui/icons";
import { Radioactive, WarningCircle } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { DownloadHealthNotice } from "@/components/downloads/download-health-notice";
import { FileSelectorDialog } from "@/components/downloads/file-selector-dialog";
import { useInstallAction } from "@/hooks/use-install-action";
import {
  type NukeModEntry,
  type NukeModOutcome,
  useNukeReinstall,
} from "@/hooks/use-nuke-reinstall";
import { isLocalMod } from "@/lib/mods/installed-helpers";
import { getQueuedDownloads } from "@/lib/mods/mod-variants";
import { usePersistedStore } from "@/lib/store";
import { cn, formatSize, formatSpeed } from "@/lib/utils";
import { ModStatus } from "@/types/mods";

const OUTCOME_ICON = {
  pending: { icon: CircleDashed, className: "text-muted-foreground/50" },
  downloading: { icon: Loader2, className: "animate-spin text-primary" },
  installing: { icon: Loader2, className: "animate-spin text-primary" },
  restored: { icon: CheckCircle2, className: "text-emerald-500" },
  downloadedOnly: { icon: CheckCircle2, className: "text-emerald-500/60" },
  manual: { icon: WarningCircle, className: "text-amber-500" },
  failed: { icon: XCircle, className: "text-destructive" },
} satisfies Record<
  NukeModOutcome,
  { icon: React.ElementType<{ className?: string }>; className: string }
>;

type ModRowProps = {
  entry: NukeModEntry;
  canChooseFiles: boolean;
  onChooseFiles: (remoteId: string) => void;
};

const ModRow = ({ entry, canChooseFiles, onChooseFiles }: ModRowProps) => {
  const { t } = useTranslation();
  const mod = usePersistedStore((store) =>
    store.localMods.find((m) => m.remoteId === entry.remoteId),
  );
  const progress = usePersistedStore((store) =>
    store.getModProgress(entry.remoteId),
  );
  // Files picked from this dialog install the mod after the run settled it.
  const outcome =
    entry.outcome === "manual" && mod?.status === ModStatus.Installed
      ? "restored"
      : entry.outcome;
  const { icon: Icon, className } = OUTCOME_ICON[outcome];

  const renderStatus = () => {
    if (outcome === "downloading" && mod?.status === ModStatus.Extracting) {
      return (
        <span className='shrink-0 text-xs text-primary'>
          {t("modStatus.extracting")}
        </span>
      );
    }
    if (outcome === "downloading" && progress) {
      return (
        <span className='shrink-0 text-xs tabular-nums text-primary'>
          {formatSpeed(progress.speed ?? 0)}, {progress.percentage.toFixed(0)}%
        </span>
      );
    }
    if (outcome === "manual") {
      return (
        <Button
          className='h-6 shrink-0 px-2 text-xs'
          disabled={!canChooseFiles}
          title={canChooseFiles ? undefined : t("nuke.chooseFilesLater")}
          onClick={() => onChooseFiles(entry.remoteId)}
          size='sm'
          variant='outline'>
          {t("nuke.chooseFiles")}
        </Button>
      );
    }
    return (
      <span className='shrink-0 text-xs text-muted-foreground'>
        {t(`nuke.outcome.${outcome}`)}
      </span>
    );
  };

  return (
    <div className='py-1.5 text-sm'>
      <div className='flex items-center gap-2.5'>
        <Icon className={cn("h-3.5 w-3.5 shrink-0", className)} />
        <span className='min-w-0 flex-1 truncate' title={entry.name}>
          {entry.name}
        </span>
        {renderStatus()}
      </div>
      {outcome === "failed" && entry.error && (
        <p
          className='mt-0.5 line-clamp-2 pl-6 text-destructive/80 text-xs'
          title={entry.error}>
          {entry.error}
        </p>
      )}
    </div>
  );
};

const PLAN_STEPS = ["backup", "wipe", "download", "install"] as const;

const PlanStat = ({ label, value }: { label: string; value: string }) => (
  <div className='flex flex-col gap-0.5 px-3 py-2.5'>
    <span className='font-semibold text-foreground text-lg tabular-nums leading-none'>
      {value}
    </span>
    <span className='text-muted-foreground text-xs'>{label}</span>
  </div>
);

type NukeReinstallDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const NukeReinstallDialog = ({
  open,
  onOpenChange,
}: NukeReinstallDialogProps) => {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const { state, run, reset, requestCancel, retryFailed } = useNukeReinstall();
  const localMods = usePersistedStore((store) => store.localMods);
  const {
    performInstall,
    currentFileTree,
    showFileSelector,
    confirmInstallation,
    cancelInstallation,
    currentMod,
  } = useInstallAction();
  const installing = localMods.some(
    (mod) => mod.status === ModStatus.Installing,
  );

  const chooseFiles = (remoteId: string) => {
    const mod = localMods.find((m) => m.remoteId === remoteId);
    if (mod) {
      void performInstall(mod, "reinstall");
    }
  };

  const downloadingMod = localMods.find(
    (mod) =>
      mod.remoteId ===
      state.mods.find((entry) => entry.outcome === "downloading")?.remoteId,
  );
  const downloadingProgress = usePersistedStore((store) =>
    downloadingMod ? store.getModProgress(downloadingMod.remoteId) : undefined,
  );

  const plan = useMemo(() => {
    const remote = localMods.filter((mod) => !isLocalMod(mod));
    return {
      total: remote.length,
      installed: remote.filter((mod) => mod.status === ModStatus.Installed)
        .length,
      skipped: localMods.length - remote.length,
      downloadSize: remote
        .flatMap(getQueuedDownloads)
        .reduce((total, file) => total + (file.size || 0), 0),
    };
  }, [localMods]);

  const summary = useMemo(() => {
    const counted = (outcome: NukeModOutcome) =>
      state.mods.filter((entry) => entry.outcome === outcome).length;
    return {
      restored: counted("restored") + counted("downloadedOnly"),
      manual: counted("manual"),
      failed: counted("failed"),
    };
  }, [state.mods]);

  const backupFailed = state.phase === "backupFailed";
  const isFinished =
    state.phase === "done" || state.phase === "failed" || backupFailed;

  const closeDialog = () => {
    if (state.isRunning) {
      return;
    }
    onOpenChange(false);
    setConfirming(false);
    reset();
  };

  const startNuke = () => {
    setConfirming(false);
    void run();
  };

  return (
    <>
      <Dialog
        onOpenChange={(next) => (next ? onOpenChange(true) : closeDialog())}
        open={open}>
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader className='flex-row items-start gap-3 space-y-0 text-left'>
            <div className='flex size-10 shrink-0 items-center justify-center rounded-md border border-destructive/30 bg-destructive/10'>
              <Radioactive
                className='size-5 text-destructive'
                weight='duotone'
              />
            </div>
            <div className='min-w-0 space-y-1'>
              <DialogTitle>
                {confirming ? t("nuke.areYouSure") : t("nuke.title")}
              </DialogTitle>
              <DialogDescription className='leading-relaxed'>
                {confirming
                  ? t("nuke.areYouSureBody", { count: plan.total })
                  : state.phase === "idle"
                    ? t("nuke.description")
                    : t(`nuke.phase.${state.phase}`)}
              </DialogDescription>
            </div>
          </DialogHeader>

          {confirming ? null : state.phase === "idle" ? (
            <div className='space-y-4'>
              <div className='grid grid-cols-3 divide-x divide-border/60 rounded-md border bg-card/40'>
                <PlanStat
                  label={t("nuke.stat.mods")}
                  value={String(plan.total)}
                />
                <PlanStat
                  label={t("nuke.stat.installed")}
                  value={String(plan.installed)}
                />
                <PlanStat
                  label={t("nuke.stat.download")}
                  value={
                    plan.downloadSize > 0 ? formatSize(plan.downloadSize) : "?"
                  }
                />
              </div>

              <ol className='space-y-3'>
                {PLAN_STEPS.map((key, index) => (
                  <li className='flex gap-3' key={key}>
                    <span className='flex size-6 shrink-0 items-center justify-center rounded-full border bg-muted/40 font-medium text-muted-foreground text-xs tabular-nums'>
                      {index + 1}
                    </span>
                    <div className='min-w-0 pt-0.5'>
                      <p className='font-medium text-foreground/90 text-sm'>
                        {t(`nuke.steps.${key}.title`)}
                      </p>
                      <p className='text-muted-foreground text-xs leading-relaxed'>
                        {t(`nuke.steps.${key}.body`)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>

              {plan.skipped > 0 && (
                <div className='flex items-start gap-2 rounded-md bg-muted/40 px-3 py-2 text-muted-foreground text-xs leading-relaxed'>
                  <HardDrive className='mt-0.5 size-3.5 shrink-0' />
                  <span>
                    {t("nuke.localModsPreserved", { count: plan.skipped })}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className='space-y-3'>
              <div className='space-y-1.5'>
                <div className='flex items-center justify-between text-sm'>
                  <span className='min-w-0 truncate font-medium'>
                    {state.currentMod ?? t(`nuke.phase.${state.phase}`)}
                  </span>
                  <span className='shrink-0 text-muted-foreground text-xs'>
                    {Math.round(state.progress)}%
                  </span>
                </div>
                <Progress className='h-2' value={state.progress} />
              </div>

              {state.mods.length > 0 && !backupFailed && (
                <ScrollArea className='rounded-md border px-3 [&>[data-radix-scroll-area-viewport]]:max-h-56'>
                  <div className='divide-y divide-border/50'>
                    {state.mods.map((entry) => (
                      <ModRow
                        canChooseFiles={
                          !state.isRunning && !installing && !showFileSelector
                        }
                        entry={entry}
                        key={entry.remoteId}
                        onChooseFiles={chooseFiles}
                      />
                    ))}
                  </div>
                </ScrollArea>
              )}

              {downloadingMod && (
                <DownloadHealthNotice
                  progress={downloadingProgress}
                  status={downloadingMod.status}
                />
              )}

              {backupFailed && (
                <p className='rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive text-xs'>
                  {t("nuke.backupFailedBody", { reason: state.error })}
                </p>
              )}

              {isFinished && !backupFailed && (
                <div className='space-y-1 rounded-md border bg-card/50 p-3 text-xs text-muted-foreground'>
                  {state.phase === "failed" && (
                    <p className='text-destructive'>
                      {state.error
                        ? t("nuke.aborted", { reason: state.error })
                        : t("nuke.phase.failed")}
                    </p>
                  )}
                  <p>
                    {t("nuke.summary", {
                      restored: summary.restored,
                      total: state.mods.length,
                    })}
                  </p>
                  {state.missingOnDisk > 0 && (
                    <p>
                      {t("nuke.summaryMissing", { count: state.missingOnDisk })}
                    </p>
                  )}
                  {summary.manual > 0 && (
                    <p>{t("nuke.summaryManual", { count: summary.manual })}</p>
                  )}
                  {summary.failed > 0 && (
                    <p className='text-destructive'>
                      {t("nuke.summaryFailed", { count: summary.failed })}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {state.phase === "idle" && !confirming && (
              <>
                <Button onClick={closeDialog} variant='outline'>
                  {t("common.cancel")}
                </Button>
                <Button
                  disabled={plan.total === 0}
                  onClick={() => setConfirming(true)}
                  variant='destructive'>
                  {t("nuke.continue")}
                </Button>
              </>
            )}
            {confirming && (
              <>
                <Button onClick={() => setConfirming(false)} variant='outline'>
                  {t("common.back")}
                </Button>
                <Button onClick={startNuke} variant='destructive'>
                  <Radioactive className='h-3.5 w-3.5' />
                  {t("nuke.confirmAction")}
                </Button>
              </>
            )}
            {state.isRunning && state.phase === "reinstalling" && (
              <Button
                disabled={state.cancelRequested}
                onClick={requestCancel}
                variant='outline'>
                {state.cancelRequested
                  ? t("nuke.stopping")
                  : t("nuke.stopAfterCurrent")}
              </Button>
            )}
            {isFinished && summary.failed > 0 && (
              <Button onClick={retryFailed} variant='outline'>
                {t("nuke.retryFailed", { count: summary.failed })}
              </Button>
            )}
            {isFinished && (
              <Button onClick={closeDialog}>{t("common.close")}</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <FileSelectorDialog
        fileTree={currentFileTree}
        isOpen={showFileSelector}
        modName={currentMod?.name}
        onCancel={cancelInstallation}
        onConfirm={confirmInstallation}
        onOpenChange={(next) => {
          if (!next) {
            cancelInstallation();
          }
        }}
      />
    </>
  );
};
