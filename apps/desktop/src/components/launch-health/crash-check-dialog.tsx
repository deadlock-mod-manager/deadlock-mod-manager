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
  LightbulbIcon,
  LightningSlashIcon,
  PlayIcon,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import type { CrashCheck } from "@/hooks/use-crash-check";
import { useLaunch } from "@/hooks/use-launch";
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
      <DialogContent className='gap-5 sm:max-w-xl'>
        <DialogHeader className='flex-row items-start gap-4 space-y-0 text-left'>
          <div className='flex size-10 shrink-0 items-center justify-center rounded-md bg-destructive/15'>
            <LightningSlashIcon
              className='size-5 text-destructive'
              weight='duotone'
            />
          </div>
          <div className='space-y-1.5'>
            <DialogTitle>{t("launchHealth.dialog.title")}</DialogTitle>
            <DialogDescription>
              {report.dump
                ? t("launchHealth.dialog.closedWithReport", { duration })
                : t("launchHealth.dialog.closedWithoutShutdown", {
                    duration,
                  })}{" "}
              {decision.buildChanged
                ? t("launchHealth.dialog.buildChanged")
                : report.dump
                  ? t("launchHealth.dialog.maybeChanges")
                  : t("launchHealth.dialog.maybeChangesUnlessYou")}
            </DialogDescription>
          </div>
        </DialogHeader>

        <section className='space-y-2'>
          <h3 className='font-semibold text-muted-foreground text-xs uppercase tracking-wide'>
            {t("launchHealth.dialog.changesHeading")}
          </h3>
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

        <p className='flex items-start gap-2 text-muted-foreground text-xs'>
          <LightbulbIcon className='mt-px size-4 shrink-0' weight='duotone' />
          {t("launchHealth.dialog.tip")}
        </p>

        <DialogFooter className='flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between sm:space-x-0'>
          <div className='flex items-center gap-2'>
            <Checkbox
              checked={crashCheck.optOut}
              id={OPT_OUT_ID}
              onCheckedChange={(checked) =>
                crashCheck.setOptOut(checked === true)
              }
            />
            <Label
              className='font-normal text-muted-foreground text-sm'
              htmlFor={OPT_OUT_ID}>
              {t("launchHealth.dialog.optOut")}
            </Label>
          </div>
          <div className='flex gap-2'>
            <Button onClick={crashCheck.closedByUser} variant='ghost'>
              {t("launchHealth.dialog.closedIt")}
            </Button>
            <Button
              disabled={relaunch.isPending || crashCheck.gameRunning}
              onClick={() => relaunch.mutate(offersConfigOff)}>
              <PlayIcon className='size-4' weight='fill' />
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
