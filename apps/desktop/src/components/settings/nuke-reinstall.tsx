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
  Bomb,
  CheckCircle2,
  CircleDashed,
  Loader2,
  XCircle,
} from "@deadlock-mods/ui/icons";
import { WarningCircle } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type NukeModEntry,
  type NukeModOutcome,
  useNukeReinstall,
} from "@/hooks/use-nuke-reinstall";
import { usePersistedStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { ModStatus } from "@/types/mods";

const OUTCOME_ICON: Record<
  NukeModOutcome,
  { icon: React.ElementType<{ className?: string }>; className: string }
> = {
  pending: { icon: CircleDashed, className: "text-muted-foreground/50" },
  downloading: { icon: Loader2, className: "animate-spin text-primary" },
  installing: { icon: Loader2, className: "animate-spin text-primary" },
  restored: { icon: CheckCircle2, className: "text-emerald-500" },
  downloadedOnly: { icon: CheckCircle2, className: "text-emerald-500/60" },
  manual: { icon: WarningCircle, className: "text-amber-500" },
  failed: { icon: XCircle, className: "text-destructive" },
};

const ModRow = ({ entry }: { entry: NukeModEntry }) => {
  const { t } = useTranslation();
  const { icon: Icon, className } = OUTCOME_ICON[entry.outcome];

  return (
    <div className='flex items-center gap-2.5 py-1.5 text-sm'>
      <Icon className={cn("h-3.5 w-3.5 shrink-0", className)} />
      <span className='min-w-0 flex-1 truncate'>{entry.name}</span>
      <span className='shrink-0 text-xs text-muted-foreground'>
        {entry.error ?? t(`nuke.outcome.${entry.outcome}`)}
      </span>
    </div>
  );
};

export const NukeReinstall = () => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { state, run, reset, requestCancel } = useNukeReinstall();
  const localMods = usePersistedStore((store) => store.localMods);

  const plan = useMemo(() => {
    const remote = localMods.filter(
      (mod) => !mod.remoteId.startsWith("local-"),
    );
    return {
      total: remote.length,
      installed: remote.filter((mod) => mod.status === ModStatus.Installed)
        .length,
      skipped: localMods.length - remote.length,
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

  const closeDialog = () => {
    if (state.isRunning) {
      return;
    }
    setOpen(false);
    reset();
  };

  return (
    <>
      <div className='group flex items-center gap-4 py-3'>
        <div className='min-w-0 flex-1'>
          <p className='text-sm font-medium text-foreground/90'>
            {t("nuke.title")}
          </p>
          <p className='text-xs text-muted-foreground leading-relaxed'>
            {t("nuke.description")}
          </p>
        </div>
        <Button
          className='shrink-0 gap-1.5 shadow-sm transition-all hover:shadow-destructive/20'
          onClick={() => setOpen(true)}
          size='sm'
          variant='destructive'>
          <Bomb className='h-3.5 w-3.5' />
          {t("nuke.action")}
        </Button>
      </div>

      <Dialog
        onOpenChange={(next) => (next ? setOpen(true) : closeDialog())}
        open={open}>
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2'>
              <Bomb className='h-4 w-4 text-destructive' />
              {t("nuke.title")}
            </DialogTitle>
            <DialogDescription>
              {state.phase === "idle"
                ? t("nuke.confirmBody", {
                    count: plan.total,
                    installed: plan.installed,
                  })
                : t(`nuke.phase.${state.phase}`)}
            </DialogDescription>
          </DialogHeader>

          {state.phase === "idle" ? (
            <div className='space-y-3 text-sm'>
              <div className='rounded-md border border-destructive/30 bg-destructive/5 p-3 text-muted-foreground text-xs leading-relaxed'>
                {t("nuke.confirmDetails")}
              </div>
              {plan.skipped > 0 && (
                <p className='text-xs text-muted-foreground'>
                  {t("nuke.localModsPreserved", { count: plan.skipped })}
                </p>
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

              {state.mods.length > 0 && (
                <ScrollArea className='max-h-56 rounded-md border px-3'>
                  <div className='divide-y divide-border/50'>
                    {state.mods.map((entry) => (
                      <ModRow entry={entry} key={entry.remoteId} />
                    ))}
                  </div>
                </ScrollArea>
              )}

              {state.phase === "done" && (
                <div className='space-y-1 rounded-md border bg-card/50 p-3 text-xs text-muted-foreground'>
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
            {state.phase === "idle" && (
              <>
                <Button onClick={closeDialog} variant='outline'>
                  {t("common.cancel")}
                </Button>
                <Button
                  disabled={plan.total === 0}
                  onClick={run}
                  variant='destructive'>
                  <Bomb className='h-3.5 w-3.5' />
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
            {state.phase === "done" && (
              <Button onClick={closeDialog}>{t("common.close")}</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
