import { toast } from "@deadlock-mods/ui/components/sonner";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import type { useMatchSync } from "@/hooks/use-match-sync";

// Subcodes with a stable, localizable message. Anything else (network/store
// errors) falls back to the raw backend message, since those wrap arbitrary
// underlying error text that can't be meaningfully translated.
const MATCH_SYNC_ERROR_KEYS: Record<string, string> = {
  consentRequired: "matchSync.errors.consentRequired",
  disabled: "matchSync.errors.disabled",
  alreadyRunning: "matchSync.errors.alreadyRunning",
  gcRateLimited: "matchSync.fullSync.rateLimited",
  gameRunning: "matchSync.errors.gameRunning",
  quotaReached: "matchSync.errors.quotaReached",
};

export const rawErrorMessage = (error: unknown): string => {
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
};

export const matchSyncErrorMessage = (error: unknown, t: TFunction): string => {
  if (error && typeof error === "object" && "matchSyncKind" in error) {
    const kind = (error as { matchSyncKind?: string }).matchSyncKind;
    if (kind && kind in MATCH_SYNC_ERROR_KEYS) {
      return t(MATCH_SYNC_ERROR_KEYS[kind] as string);
    }
  }
  return rawErrorMessage(error);
};

type MatchSyncControls = Pick<
  ReturnType<typeof useMatchSync>,
  "status" | "setConsent" | "setEnabled"
>;

/** Enables match sync only after the user accepts the consent dialog. */
export const useMatchSyncToggle = ({
  status,
  setConsent,
  setEnabled,
}: MatchSyncControls) => {
  const { t } = useTranslation();
  const confirm = useConfirm();

  return async (next: boolean) => {
    try {
      if (!next) {
        await setEnabled.mutateAsync(false);
        return;
      }
      if (!status?.consentAccepted) {
        const accepted = await confirm({
          title: t("matchSync.consent.title"),
          body: t("matchSync.consent.body"),
          actionButton: t("matchSync.consent.accept"),
          cancelButton: t("matchSync.consent.decline"),
        });
        if (!accepted) {
          return;
        }
        await setConsent.mutateAsync(true);
      }
      await setEnabled.mutateAsync(true);
    } catch (error) {
      toast.error(matchSyncErrorMessage(error, t));
    }
  };
};
