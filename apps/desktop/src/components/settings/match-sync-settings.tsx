import { Button } from "@deadlock-mods/ui/components/button";
import { Label } from "@deadlock-mods/ui/components/label";
import { Progress } from "@deadlock-mods/ui/components/progress";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useMatchSync } from "@/hooks/use-match-sync";
import {
  matchSyncErrorMessage,
  rawErrorMessage,
  useMatchSyncToggle,
} from "@/hooks/use-match-sync-toggle";

// Mirrors the backend's FETCH_QUOTA_LIMIT; used only until `status.accounts` loads.
const DEFAULT_QUOTA_LIMIT = 40;

export const MatchSyncSettings = () => {
  const { t } = useTranslation();
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
  const handleEnableChange = useMatchSyncToggle({
    status,
    setConsent,
    setEnabled,
  });

  // Announce the outcome once a full sync finishes (esp. hitting the daily limit).
  const wasRunning = useRef(false);
  useEffect(() => {
    if (!progress) {
      return;
    }
    const justFinished = wasRunning.current && !progress.progress.running;
    wasRunning.current = progress.progress.running;
    if (!justFinished) {
      return;
    }
    const limit =
      status?.accounts.find((a) => a.accountName === progress.accountName)
        ?.quotaLimit ?? DEFAULT_QUOTA_LIMIT;
    if (progress.progress.rateLimited && progress.progress.fetched === 0) {
      toast.warning(t("matchSync.fullSync.rateLimited"));
    } else if (progress.progress.quotaReached) {
      toast.info(
        t("matchSync.fullSync.doneQuota", {
          fetched: progress.progress.fetched,
          limit,
        }),
      );
    } else if (progress.progress.fetched > 0) {
      toast.success(
        t("matchSync.fullSync.done", { fetched: progress.progress.fetched }),
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

  const running = Boolean(status.fullSyncRunning || progress?.progress.running);
  const aboutLimit = status.accounts[0]?.quotaLimit ?? DEFAULT_QUOTA_LIMIT;
  const allQuotaExhausted =
    status.accounts.length === 0 ||
    status.accounts.every((a) => a.quotaRemaining === 0);
  const activeAccount = status.accounts.find(
    (a) => a.accountName === progress?.accountName,
  );
  const activeLimit = activeAccount?.quotaLimit ?? DEFAULT_QUOTA_LIMIT;
  const activeRemaining = progress?.progress.quotaRemaining ?? 0;
  const quotaUsedPct =
    activeLimit > 0 ? ((activeLimit - activeRemaining) / activeLimit) * 100 : 0;

  const handleStartFullSync = async () => {
    try {
      await startFullSync.mutateAsync();
      toast.success(t("matchSync.fullSync.started"));
    } catch (error) {
      toast.error(matchSyncErrorMessage(error, t));
    }
  };

  return (
    <div className='flex flex-col gap-4'>
      <div className='space-y-1 rounded-md border border-border/50 bg-muted/30 p-3 text-muted-foreground text-sm'>
        <p>{t("matchSync.about.reads")}</p>
        <p>{t("matchSync.about.sends")}</p>
        <p>{t("matchSync.about.limit", { limit: aboutLimit })}</p>
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
          <div className='flex flex-col gap-1 text-muted-foreground text-sm'>
            {status.accounts.length === 0 ? (
              <p>{t("matchSync.noAccounts")}</p>
            ) : (
              status.accounts.map((account) => (
                <p
                  className={
                    account.gcUnavailable ? "text-amber-500/90" : undefined
                  }
                  key={account.steamId64}>
                  {t("matchSync.quota.accountRemaining", {
                    name: account.accountName,
                    remaining: account.quotaRemaining,
                    limit: account.quotaLimit,
                  })}
                  {account.gcUnavailable
                    ? ` (${t("matchSync.quota.gcUnavailable")})`
                    : ""}
                </p>
              ))
            )}
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
                  disabled={allQuotaExhausted}
                  onClick={handleStartFullSync}
                  size='sm'>
                  {t("matchSync.fullSync.button")}
                </Button>
              )}
            </div>
            {running && (
              <div className='space-y-1'>
                <Progress value={quotaUsedPct} />
                {progress && (
                  <p className='text-muted-foreground text-xs'>
                    {t("matchSync.fullSync.accountProgress", {
                      index: progress.accountIndex,
                      total: progress.accountTotal,
                      name: progress.accountName,
                    })}
                  </p>
                )}
                <p className='text-muted-foreground text-xs'>
                  {t("matchSync.fullSync.running", {
                    fetched: progress?.progress.fetched ?? 0,
                    remaining: activeRemaining,
                    limit: activeLimit,
                  })}
                </p>
              </div>
            )}
            {!running && allQuotaExhausted && status.accounts.length > 0 && (
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
