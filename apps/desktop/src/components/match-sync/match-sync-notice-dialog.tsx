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
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useMatchSync } from "@/hooks/use-match-sync";
import { matchSyncErrorMessage } from "@/hooks/use-match-sync-toggle";
import { usePersistedStore } from "@/lib/store";

const DOCS_URL =
  "https://docs.deadlockmods.app/using-mod-manager/community#match-data-sharing";

/**
 * Asks users who finished onboarding to keep match sync on. The backend drops
 * consent saved under an older consent version, so this reappears for everyone
 * after a bump. Sync stays idle until they keep it on; closing the dialog any
 * other way turns it off. New users see the same choice in onboarding instead.
 */
export const MatchSyncNoticeDialog = () => {
  const { t } = useTranslation();
  const { status, setConsent, setEnabled } = useMatchSync();
  const hasCompletedOnboarding = usePersistedStore(
    (state) => state.hasCompletedOnboarding,
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
    status?.enabled === true &&
    !status.consentAccepted;
  const isSaving = setConsent.isPending || setEnabled.isPending;

  const handleKeep = useCallback(async () => {
    try {
      await setConsent.mutateAsync(true);
    } catch (error) {
      toast.error(matchSyncErrorMessage(error, t));
    }
  }, [setConsent, t]);

  const handleTurnOff = useCallback(async () => {
    try {
      await setEnabled.mutateAsync(false);
    } catch (error) {
      toast.error(matchSyncErrorMessage(error, t));
    }
  }, [setEnabled, t]);

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open && !isSaving) {
          handleTurnOff();
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
            disabled={isSaving}
            onClick={handleTurnOff}
            type='button'>
            <XIcon className='size-4' weight='bold' />
            {t("matchSync.notice.turnOff")}
          </button>
          <Button disabled={isSaving} onClick={handleKeep} type='button'>
            <CheckCircleIcon className='size-4' weight='bold' />
            {t("matchSync.notice.keepOn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
