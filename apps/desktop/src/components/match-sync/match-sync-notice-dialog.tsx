import { Button, buttonVariants } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  CheckCircleIcon,
  ShareNetworkIcon,
  XIcon,
} from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useMatchSync } from "@/hooks/use-match-sync";
import { matchSyncErrorMessage } from "@/hooks/use-match-sync-toggle";
import { usePersistedStore } from "@/lib/store";

const DOCS_URL =
  "https://docs.deadlockmods.app/using-mod-manager/community#match-data-sharing";

/**
 * One-time notice for users who finished onboarding before match sync became
 * on by default. Dismissing it keeps sync on; new users see the same choice in
 * onboarding instead.
 */
export const MatchSyncNoticeDialog = () => {
  const { t } = useTranslation();
  const { status, setEnabled } = useMatchSync();
  const hasCompletedOnboarding = usePersistedStore(
    (state) => state.hasCompletedOnboarding,
  );
  const hasSeenNotice = usePersistedStore(
    (state) => state.hasSeenMatchSyncNotice,
  );
  const setHasSeenNotice = usePersistedStore(
    (state) => state.setHasSeenMatchSyncNotice,
  );
  // Let the telemetry prompt go first so the two dialogs never stack.
  const telemetryPromptResolved = usePersistedStore(
    (state) =>
      state.telemetrySettings.hasSeenTelemetryPrompt ||
      state.telemetrySettings.analyticsEnabled,
  );

  const pending =
    hasCompletedOnboarding && !hasSeenNotice && status !== undefined;

  // Users who already turned sync off keep that choice; there is nothing to announce.
  useEffect(() => {
    if (pending && !status.enabled) {
      setHasSeenNotice(true);
    }
  }, [pending, status?.enabled, setHasSeenNotice]);

  const isOpen = pending && status.enabled && telemetryPromptResolved;

  const handleKeep = useCallback(() => {
    setHasSeenNotice(true);
  }, [setHasSeenNotice]);

  const handleTurnOff = useCallback(async () => {
    try {
      await setEnabled.mutateAsync(false);
      setHasSeenNotice(true);
    } catch (error) {
      toast.error(matchSyncErrorMessage(error, t));
    }
  }, [setEnabled, setHasSeenNotice, t]);

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          handleKeep();
        }
      }}
      open={isOpen}>
      <DialogContent className='border-0 sm:max-w-md'>
        <DialogHeader>
          <div className='mb-2 flex size-10 items-center justify-center rounded-full bg-primary/10'>
            <ShareNetworkIcon
              className='size-5 text-primary'
              weight='duotone'
            />
          </div>
          <DialogTitle>{t("matchSync.notice.title")}</DialogTitle>
          <DialogDescription>
            {t("matchSync.notice.description")}
          </DialogDescription>
        </DialogHeader>

        <ul className='list-disc space-y-1 pl-5 text-sm text-muted-foreground'>
          <li>{t("matchSync.notice.benefit")}</li>
          <li>{t("matchSync.about.summary")}</li>
          <li>{t("matchSync.notice.settings")}</li>
        </ul>

        <button
          className='self-start text-sm text-primary underline-offset-4 hover:underline'
          onClick={() => openUrl(DOCS_URL)}
          type='button'>
          {t("matchSync.notice.learnMore")}
        </button>

        <DialogFooter className='gap-2 sm:gap-2'>
          <button
            className={buttonVariants({ variant: "outline" })}
            disabled={setEnabled.isPending}
            onClick={handleTurnOff}
            type='button'>
            <XIcon className='size-4' weight='bold' />
            {t("matchSync.notice.turnOff")}
          </button>
          <Button
            disabled={setEnabled.isPending}
            onClick={handleKeep}
            type='button'>
            <CheckCircleIcon className='size-4' weight='bold' />
            {t("matchSync.notice.keepOn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
