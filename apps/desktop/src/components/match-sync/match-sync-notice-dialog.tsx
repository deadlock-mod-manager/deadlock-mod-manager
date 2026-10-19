import { Button, buttonVariants } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import {
  CheckCircleIcon,
  ShareNetworkIcon,
  XIcon,
} from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { useMatchSync } from "@/hooks/use-match-sync";
import { useMatchSyncToggle } from "@/hooks/use-match-sync-toggle";
import { usePersistedStore } from "@/lib/store";

const DOCS_URL =
  "https://docs.deadlockmods.app/using-mod-manager/community#match-data-sharing";

/**
 * Asks users who finished onboarding before it had a match sync step whether
 * to turn sync on. Shown once; "Turn on" still goes through the consent dialog.
 * New users answer the same question in onboarding instead.
 */
export const MatchSyncNoticeDialog = () => {
  const { t } = useTranslation();
  const { status, setConsent, setEnabled } = useMatchSync();
  const handleEnableChange = useMatchSyncToggle({
    status,
    setConsent,
    setEnabled,
  });
  const hasCompletedOnboarding = usePersistedStore(
    (state) => state.hasCompletedOnboarding,
  );
  const promptDismissed = usePersistedStore(
    (state) => state.matchSyncPromptDismissed,
  );
  const dismissPrompt = usePersistedStore(
    (state) => state.dismissMatchSyncPrompt,
  );
  // Let the telemetry prompt go first so the two dialogs never stack.
  const telemetryPromptResolved = usePersistedStore(
    (state) =>
      state.telemetrySettings.hasSeenTelemetryPrompt ||
      state.telemetrySettings.analyticsEnabled,
  );

  const isOpen =
    hasCompletedOnboarding &&
    telemetryPromptResolved &&
    !promptDismissed &&
    status?.enabled === false &&
    !status.consentAccepted;

  const handleTurnOn = () => {
    dismissPrompt();
    void handleEnableChange(true);
  };

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          dismissPrompt();
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
            onClick={dismissPrompt}
            type='button'>
            <XIcon className='size-4' weight='bold' />
            {t("matchSync.notice.noThanks")}
          </button>
          <Button onClick={handleTurnOn} type='button'>
            <CheckCircleIcon className='size-4' weight='bold' />
            {t("matchSync.notice.turnOn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
