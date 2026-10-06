import { Button } from "@deadlock-mods/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { RefreshCw } from "@deadlock-mods/ui/icons";
import { formatDistanceToNow } from "date-fns";
import { useTranslation } from "react-i18next";
import { MatchSyncToggle } from "@/components/stats/match-sync-toggle";
import { cn } from "@/lib/utils";

interface StatsFreshness {
  fetchedAt: number | null;
  isStale: boolean;
  isRefreshing: boolean;
  canRefresh: boolean;
  onRefresh: () => void;
}

interface StatsStatusProps {
  /** Absent until an account is known: there is nothing loaded to refresh. */
  freshness?: StatsFreshness;
}

/**
 * How fresh the numbers are and whether this app keeps them current. It lives in the page title row, which otherwise sits empty, so
 * the account and tabs below get a row to themselves.
 */
export const StatsStatus = ({ freshness }: StatsStatusProps) => {
  const { t } = useTranslation();

  return (
    <div className='flex shrink-0 items-center gap-4'>
      {/* Freshness is context, not a control, so it stays quiet text. Refresh
          sits right after the timestamp because that is the thing it changes. */}
      {freshness && (
        <>
          <div className='flex items-center gap-1'>
            {freshness.fetchedAt !== null && (
              <span className='whitespace-nowrap text-muted-foreground text-xs'>
                {t(freshness.isStale ? "stats.offlineData" : "stats.updated", {
                  ago: formatDistanceToNow(freshness.fetchedAt, {
                    addSuffix: true,
                  }),
                })}
              </span>
            )}
            <Tooltip>
              {/* The trigger has to sit on something enabled: a disabled button
                  swallows pointer events, so the cooldown explanation - the one
                  case the tooltip actually matters - would never appear. */}
              <TooltipTrigger asChild>
                <span className='inline-flex'>
                  <Button
                    aria-label={t("stats.refresh")}
                    className='h-6 w-6 text-muted-foreground hover:text-foreground'
                    disabled={!freshness.canRefresh || freshness.isRefreshing}
                    onClick={freshness.onRefresh}
                    size='icon'
                    variant='ghost'>
                    <RefreshCw
                      className={cn(
                        "h-3.5 w-3.5",
                        freshness.isRefreshing && "motion-safe:animate-spin",
                      )}
                    />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {freshness.canRefresh
                  ? t("stats.refreshHint")
                  : t("stats.refreshCooldown")}
              </TooltipContent>
            </Tooltip>
          </div>
          <div aria-hidden className='h-4 w-px shrink-0 bg-border/60' />
        </>
      )}

      <MatchSyncToggle />
    </div>
  );
};
