import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import { Progress } from "@deadlock-mods/ui/components/progress";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { TriangleAlert } from "@deadlock-mods/ui/icons";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  SettingRow,
  SettingToggleRow,
} from "@/components/settings/setting-row";
import { useMatchSync } from "@/hooks/use-match-sync";
import {
  matchSyncErrorMessage,
  rawErrorMessage,
  useMatchSyncToggle,
} from "@/hooks/use-match-sync-toggle";

// Mirrors the backend's FETCH_QUOTA_LIMIT; used only until `status.accounts` loads.
const DEFAULT_QUOTA_LIMIT = 40;
const FULL_SYNC_DESCRIPTION_ID = "match-sync-full-sync-description";

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
      <div className='space-y-2 text-muted-foreground text-sm'>
        <ul className='list-disc space-y-1 pl-5'>
          <li>{t("matchSync.about.reads")}</li>
          <li>{t("matchSync.about.sends")}</li>
          <li>{t("matchSync.about.limit", { limit: aboutLimit })}</li>
        </ul>
        <p className='flex items-center gap-1.5 text-amber-500/90'>
          <TriangleAlert aria-hidden='true' className='size-4 shrink-0' />
          {t("matchSync.about.risk")}
        </p>
      </div>

      <SettingToggleRow
        checked={status.enabled}
        id='toggle-match-sync'
        onCheckedChange={handleEnableChange}
        title={t("matchSync.enable.title")}
      />

      {status.enabled && (
        <>
          <div className='flex flex-col gap-2 text-sm'>
            <p className='font-medium text-foreground'>
              {t("matchSync.quota.accountsTitle")}
            </p>
            {status.accounts.length === 0 ? (
              <p className='text-muted-foreground'>
                {t("matchSync.noAccounts")}
              </p>
            ) : (
              <ul className='divide-y divide-border/30'>
                {status.accounts.map((account) => (
                  <li
                    className='flex min-h-9 items-center gap-3 py-1.5'
                    key={account.steamId64}>
                    <span className='min-w-0 truncate text-foreground'>
                      {account.accountName}
                    </span>
                    {account.gcUnavailable && (
                      <Badge
                        className='border-amber-500/30 bg-amber-500/10 text-amber-500'
                        variant='outline'>
                        {t("matchSync.quota.gcUnavailable")}
                      </Badge>
                    )}
                    <span className='ml-auto shrink-0 text-muted-foreground tabular-nums'>
                      {t("matchSync.quota.left", {
                        remaining: account.quotaRemaining,
                        limit: account.quotaLimit,
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className='flex flex-col gap-2 border-border/30 border-t pt-4'>
            <SettingRow
              description={t("matchSync.fullSync.description")}
              descriptionId={FULL_SYNC_DESCRIPTION_ID}
              title={t("matchSync.fullSync.title")}>
              {running ? (
                <Button
                  aria-describedby={FULL_SYNC_DESCRIPTION_ID}
                  onClick={() => cancelFullSync.mutate()}
                  size='sm'
                  variant='outline'>
                  {t("matchSync.fullSync.cancel")}
                </Button>
              ) : (
                <Button
                  aria-describedby={FULL_SYNC_DESCRIPTION_ID}
                  disabled={allQuotaExhausted}
                  onClick={handleStartFullSync}
                  size='sm'>
                  {t("matchSync.fullSync.button")}
                </Button>
              )}
            </SettingRow>
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
