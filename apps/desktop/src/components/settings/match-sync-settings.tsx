import { Button } from "@deadlock-mods/ui/components/button";
import { Label } from "@deadlock-mods/ui/components/label";
import { Progress } from "@deadlock-mods/ui/components/progress";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { Switch } from "@deadlock-mods/ui/components/switch";
import type { TFunction } from "i18next";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import { useMatchSync } from "@/hooks/use-match-sync";

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

const rawErrorMessage = (error: unknown): string => {
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
};

const errorMessage = (error: unknown, t: TFunction): string => {
  if (error && typeof error === "object" && "matchSyncKind" in error) {
    const kind = (error as { matchSyncKind?: string }).matchSyncKind;
    if (kind && kind in MATCH_SYNC_ERROR_KEYS) {
      return t(MATCH_SYNC_ERROR_KEYS[kind] as string);
    }
  }
  return rawErrorMessage(error);
};

export const MatchSyncSettings = () => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const {
    status,
    isLoading,
    isError,
    error,
    refetch,
    progress,
    setConsent,
    setEnabled,
    startFullSync,
    cancelFullSync,
  } = useMatchSync();

  // Announce the outcome once a full sync finishes (esp. hitting the daily limit).
  const wasRunning = useRef(false);
  useEffect(() => {
    if (!progress) {
      return;
    }
    const justFinished = wasRunning.current && !progress.running;
    wasRunning.current = progress.running;
    if (!justFinished) {
      return;
    }
    if (progress.rateLimited && progress.fetched === 0) {
      toast.warning(t("matchSync.fullSync.rateLimited"));
    } else if (progress.quotaReached) {
      toast.info(
        t("matchSync.fullSync.doneQuota", {
          fetched: progress.fetched,
          limit: status?.quotaLimit ?? 40,
        }),
      );
    } else if (progress.fetched > 0) {
      toast.success(
        t("matchSync.fullSync.done", { fetched: progress.fetched }),
      );
    }
  }, [progress, status, t]);

  if (isError) {
    return (
      <div className='flex flex-col gap-2'>
        <p className='text-destructive text-sm'>
          {t("matchSync.loadError.title")}
          {error ? `: ${rawErrorMessage(error)}` : ""}
        </p>
        <Button
          className='w-fit'
          onClick={() => refetch()}
          size='sm'
          variant='outline'>
          {t("matchSync.loadError.retry")}
        </Button>
      </div>
    );
  }

  if (isLoading || !status) {
    return (
      <div className='flex flex-col gap-3'>
        <Skeleton className='h-4 w-full' />
        <Skeleton className='h-10 w-full' />
      </div>
    );
  }

  const running = Boolean(status.fullSyncRunning || progress?.running);
  const quotaRemaining = progress?.quotaRemaining ?? status.quotaRemaining;
  const quotaUsedPct =
    status.quotaLimit > 0
      ? ((status.quotaLimit - quotaRemaining) / status.quotaLimit) * 100
      : 0;

  const handleEnableChange = async (next: boolean) => {
    try {
      if (!next) {
        await setEnabled.mutateAsync(false);
        return;
      }
      if (!status.consentAccepted) {
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
      toast.error(errorMessage(error, t));
    }
  };

  const handleStartFullSync = async () => {
    try {
      await startFullSync.mutateAsync();
      toast.success(t("matchSync.fullSync.started"));
    } catch (error) {
      toast.error(errorMessage(error, t));
    }
  };

  return (
    <div className='flex flex-col gap-4'>
      <div className='space-y-1 rounded-md border border-border/50 bg-muted/30 p-3 text-muted-foreground text-sm'>
        <p>{t("matchSync.about.reads")}</p>
        <p>{t("matchSync.about.sends")}</p>
        <p>{t("matchSync.about.limit", { limit: status.quotaLimit })}</p>
        <p className='text-amber-500/90'>{t("matchSync.about.risk")}</p>
      </div>

      <div className='flex items-center justify-between'>
        <div className='space-y-1'>
          <Label className='font-bold text-sm'>
            {t("matchSync.enable.title")}
          </Label>
          <p className='text-muted-foreground text-sm'>
            {t("matchSync.enable.description")}
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <Switch
            checked={status.enabled}
            id='toggle-match-sync'
            onCheckedChange={handleEnableChange}
          />
          <Label htmlFor='toggle-match-sync'>
            {status.enabled ? t("status.enabled") : t("status.disabled")}
          </Label>
        </div>
      </div>

      {status.enabled && (
        <>
          <div className='text-muted-foreground text-sm'>
            {t("matchSync.quota.remaining", {
              remaining: quotaRemaining,
              limit: status.quotaLimit,
            })}
          </div>

          <div className='flex flex-col gap-2 border-border/30 border-t pt-4'>
            <div className='flex items-center justify-between gap-4'>
              <div className='space-y-1'>
                <Label className='font-bold text-sm'>
                  {t("matchSync.fullSync.title")}
                </Label>
                <p className='text-muted-foreground text-sm'>
                  {t("matchSync.fullSync.description")}
                </p>
              </div>
              {running ? (
                <Button
                  onClick={() => cancelFullSync.mutate()}
                  size='sm'
                  variant='outline'>
                  {t("matchSync.fullSync.cancel")}
                </Button>
              ) : (
                <Button
                  disabled={quotaRemaining === 0}
                  onClick={handleStartFullSync}
                  size='sm'>
                  {t("matchSync.fullSync.button")}
                </Button>
              )}
            </div>
            {running && (
              <div className='space-y-1'>
                <Progress value={quotaUsedPct} />
                <p className='text-muted-foreground text-xs'>
                  {t("matchSync.fullSync.running", {
                    fetched: progress?.fetched ?? 0,
                    remaining: quotaRemaining,
                    limit: status.quotaLimit,
                  })}
                </p>
              </div>
            )}
            {!running && quotaRemaining === 0 && (
              <p className='text-amber-500/90 text-xs'>
                {t("matchSync.quota.reachedToday")}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
};
