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
import { isMatchSyncBuilt } from "@/lib/runtime-bootstrap";
import { cn } from "@/lib/utils";

interface StatsFreshness {
  fetchedAt: number | null;
  isStale: boolean;
  isRefreshing: boolean;
  canRefresh: boolean;
  onRefresh: () => void;
}

interface StatsStatusProps {
  freshness?: StatsFreshness;
}

export const StatsStatus = ({ freshness }: StatsStatusProps) => {
  const { t } = useTranslation();

  return (
    <div className='flex shrink-0 items-center gap-4'>
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

      {isMatchSyncBuilt() && <MatchSyncToggle />}
    </div>
  );
};
