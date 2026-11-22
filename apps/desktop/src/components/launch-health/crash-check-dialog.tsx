import { Alert, AlertDescription } from "@deadlock-mods/ui/components/alert";
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
import { Label } from "@deadlock-mods/ui/components/label";
import {
  BugBeetleIcon,
  CaretRightIcon,
  LightningSlashIcon,
  PlayIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import type { CrashCheck } from "@/hooks/use-crash-check";
import { useLaunch } from "@/hooks/use-launch";
import { openFindBrokenMod } from "@/lib/bisect/dialogs";
import {
  type CrashCheckPrompt,
  modsWereLoaded,
} from "@/lib/launch-health/evaluate";
import { ChangeRow } from "./change-row";
import { formatUptime } from "./format";

const OPT_OUT_ID = "crash-check-opt-out";

/**
 * Lives here rather than in useCrashCheck because useLaunch subscribes to the
 * whole store, and this only mounts while a prompt is shown. useLaunch reports
 * launch failures itself.
 */
const useRelaunch = ({ prepareRelaunch }: CrashCheck) => {
  const { launch } = useLaunch();
  return useMutation({
    meta: { skipGlobalErrorHandler: true },
    mutationFn: async (turnOffConfigFirst: boolean) => {
      const report = await prepareRelaunch(turnOffConfigFirst);
      if (report) await launch(!modsWereLoaded(report.fingerprint));
    },
  });
};

type CrashCheckDialogProps = {
  crashCheck: CrashCheck;
  prompt: CrashCheckPrompt;
};

export const CrashCheckDialog = ({
  crashCheck,
  prompt,
}: CrashCheckDialogProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const relaunch = useRelaunch(crashCheck);
  const { report, decision } = prompt;
  const duration = formatUptime(t, report.uptimeSecs ?? 0);
  const offersConfigOff =
    decision.changes.some((change) => change.kind === "perfConfig") &&
    !crashCheck.configTurnedOff;

  const openSettings = (tab: "autoexec" | "launch-options") => {
    crashCheck.dismiss();
    navigate("/settings", { state: { activeTab: tab } });
  };

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) crashCheck.dismiss();
      }}
      open={crashCheck.dialogOpen}>
      <DialogContent className='max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] gap-5 overflow-y-auto sm:max-w-xl'>
        <DialogHeader className='flex-row items-start gap-3 space-y-0 pr-4 text-left'>
          <div className='flex size-10 shrink-0 items-center justify-center rounded-md bg-destructive/15'>
            <LightningSlashIcon
              aria-hidden='true'
              className='size-5 text-destructive'
              weight='duotone'
            />
          </div>
          <div className='min-w-0 space-y-2'>
            <DialogTitle className='leading-snug'>
              {t("launchHealth.dialog.title")}
            </DialogTitle>
            <DialogDescription className='leading-relaxed'>
              {report.dump
                ? t("launchHealth.dialog.closedWithReport", { duration })
                : t("launchHealth.dialog.closedWithoutShutdown", {
                    duration,
                  })}{" "}
              {!decision.buildChanged &&
                !report.crashSuspect &&
                (report.dump
                  ? t("launchHealth.dialog.maybeChanges")
                  : t("launchHealth.dialog.maybeChangesUnlessYou"))}
            </DialogDescription>
          </div>
        </DialogHeader>

        {report.crashSuspect && (
          <Alert
            aria-labelledby='crash-suspect-heading'
            className='items-start gap-3'
            role='region'
            variant='warning'>
            <WarningCircleIcon
              aria-hidden='true'
              className='mt-0.5 size-5 shrink-0'
              weight='duotone'
            />
            <div className='min-w-0 space-y-2'>
              <div className='space-y-1'>
                <h3 className='font-medium text-xs' id='crash-suspect-heading'>
                  {t("launchHealth.dialog.possibleCause")}
                </h3>
                <p className='break-words font-semibold text-base text-foreground leading-snug'>
                  {report.crashSuspect.modName ?? report.crashSuspect.vpk}
                </p>
              </div>
              <AlertDescription>
                {t("launchHealth.dialog.possibleCauseHint")}
              </AlertDescription>
              <code className='block break-all font-mono text-xs leading-relaxed'>
                {report.crashSuspect.resourcePath}
              </code>
            </div>
          </Alert>
        )}
        {(decision.changes.length > 0 || decision.buildChanged) && (
          <section className='space-y-2'>
            <h3 className='font-medium text-muted-foreground text-sm'>
              {t("launchHealth.dialog.changesHeading")}
            </h3>
            {decision.buildChanged && (
              <p className='text-muted-foreground text-sm leading-relaxed'>
                {t("launchHealth.dialog.buildChanged")}
              </p>
            )}
            <ul className='space-y-2'>
              {decision.changes.map((change) => (
                <ChangeRow
                  change={change}
                  crashCheck={crashCheck}
                  key={change.kind}
                  onOpenSettings={openSettings}
                />
              ))}
            </ul>
            {!decision.modsLoaded && (
              <p className='text-muted-foreground text-xs'>
                {t("launchHealth.dialog.modsNotLoaded")}
              </p>
            )}
          </section>
        )}

        {decision.modsLoaded && (
          <Button
            className='h-auto justify-start gap-3 whitespace-normal px-3 py-3 text-left'
            onClick={() => {
              crashCheck.dismiss();
              openFindBrokenMod();
            }}
            type='button'
            variant='outline'>
            <BugBeetleIcon
              aria-hidden='true'
              className='size-4 shrink-0 text-muted-foreground'
              weight='duotone'
            />
            <span className='min-w-0 flex-1'>
              <span className='block font-medium text-sm'>
                {t("launchHealth.dialog.findBrokenMod")}
              </span>
              <span className='mt-0.5 block font-normal text-muted-foreground text-xs leading-relaxed'>
                {t("launchHealth.dialog.findBrokenModHint")}
              </span>
            </span>
            <CaretRightIcon
              aria-hidden='true'
              className='size-4 shrink-0 text-muted-foreground'
            />
          </Button>
        )}

        <p className='text-muted-foreground text-sm'>
          {t("launchHealth.dialog.tip")}
        </p>

        <DialogFooter className='flex-col gap-4 border-t pt-4 sm:flex-row sm:items-center sm:justify-between sm:space-x-0'>
          <div className='flex items-start gap-2'>
            <Checkbox
              checked={crashCheck.optOut}
              className='mt-0.5'
              id={OPT_OUT_ID}
              onCheckedChange={(checked) =>
                crashCheck.setOptOut(checked === true)
              }
            />
            <Label
              className='cursor-pointer font-normal text-muted-foreground text-xs leading-relaxed'
              htmlFor={OPT_OUT_ID}>
              {t("launchHealth.dialog.optOut")}
            </Label>
          </div>
          <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
            <Button onClick={crashCheck.closedByUser} variant='ghost'>
              {t("launchHealth.dialog.closedIt")}
            </Button>
            <Button
              disabled={relaunch.isPending || crashCheck.gameRunning}
              isLoading={relaunch.isPending}
              onClick={() => relaunch.mutate(offersConfigOff)}>
              {!relaunch.isPending && (
                <PlayIcon aria-hidden='true' className='size-4' weight='fill' />
              )}
              {offersConfigOff
                ? t("launchHealth.dialog.turnOffAndRelaunch")
                : t("launchHealth.dialog.launchAgain")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
