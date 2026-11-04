import { Button } from "@deadlock-mods/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import { Hourglass, RefreshCw, TriangleAlert } from "@deadlock-mods/ui/icons";
import { formatDistanceToNow, fromUnixTime } from "date-fns";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import {
  HERO_TILE_CLASS,
  LOSS_COLOR,
  tint,
  WIN_COLOR,
} from "@/components/stats/chart-fx";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import type { DeadlockHero } from "@/lib/deadlock-api";
import type { MatchHistoryEntry } from "@/lib/stats/api";
import { isWin } from "@/lib/stats/derive";
import { formatClock } from "@/lib/stats/format";
import { cn } from "@/lib/utils";

/** deadlock-api usually has a match within minutes; past this it is a real miss. */
const PROCESSING_WINDOW_S = 2 * 60 * 60;

const endedAt = (entry: MatchHistoryEntry) =>
  entry.start_time + entry.match_duration_s;

const isProcessing = (entry: MatchHistoryEntry | undefined) =>
  entry !== undefined &&
  Date.now() / 1000 - endedAt(entry) < PROCESSING_WINDOW_S;

/** What the history already knows, so the user can tell which match this is. */
const MatchSummary = ({
  entry,
  hero,
}: {
  entry: MatchHistoryEntry;
  hero: DeadlockHero | undefined;
}) => {
  const { t } = useTranslation();
  const won = isWin(entry);
  const color = won ? WIN_COLOR : LOSS_COLOR;

  return (
    <div className='flex w-full items-center gap-4 rounded-lg border border-border/60 bg-background px-3.5 py-2.5 text-left'>
      <span
        className='flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-bold font-mono text-[11.5px]'
        style={{ color, backgroundColor: tint(color, 12) }}>
        {won ? t("stats.recent.winShort") : t("stats.recent.lossShort")}
      </span>
      <div className='flex min-w-0 flex-1 items-center gap-2.5'>
        <HeroAvatar
          className={cn("h-[34px] w-[34px]", HERO_TILE_CLASS)}
          hero={hero}
          heroId={entry.hero_id}
        />
        <div className='flex min-w-0 flex-col gap-0.5'>
          <span className='truncate font-semibold text-[13px]'>
            {hero?.name ?? `#${entry.hero_id}`}
          </span>
          <span className='flex gap-2 text-[11.5px] text-muted-foreground'>
            {entry.match_mode === 4
              ? t("stats.scope.ranked")
              : t("stats.scope.unranked")}
            <span className='font-mono'>
              {formatClock(entry.match_duration_s)}
            </span>
          </span>
        </div>
      </div>
      <div className='flex shrink-0 flex-col items-end gap-0.5'>
        <span className='font-mono font-semibold text-[13px] tabular-nums'>
          {entry.player_kills}/{entry.player_deaths}/{entry.player_assists}
        </span>
        <span className='text-[11.5px] text-muted-foreground'>
          {t("stats.match.endedAgo", {
            time: formatDistanceToNow(fromUnixTime(endedAt(entry)), {
              addSuffix: true,
            }),
          })}
        </span>
      </div>
    </div>
  );
};

interface MatchUnavailableProps {
  entry: MatchHistoryEntry | undefined;
  hero: DeadlockHero | undefined;
  isRetrying: boolean;
  onRetry: () => void;
}

/**
 * The match is in the player's history but deadlock-api has no details for it
 * yet. A fresh match reads as still processing, not as a failure.
 */
export const MatchUnavailable = ({
  entry,
  hero,
  isRetrying,
  onRetry,
}: MatchUnavailableProps) => {
  const { t } = useTranslation();
  const processing = isProcessing(entry);
  const Icon = processing ? Hourglass : TriangleAlert;

  return (
    <Empty className='mx-auto max-w-lg py-16'>
      {entry && <MatchSummary entry={entry} hero={hero} />}
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <Icon
            className={
              processing ? "text-muted-foreground" : "text-destructive"
            }
          />
        </EmptyMedia>
        <EmptyTitle>
          {processing
            ? t("stats.match.processingTitle")
            : t("stats.match.errorTitle")}
        </EmptyTitle>
        <EmptyDescription>
          {processing
            ? t("stats.match.processingDescription")
            : t("stats.match.errorDescription")}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className='flex-row justify-center'>
        <Button
          className='gap-1.5'
          disabled={isRetrying}
          onClick={onRetry}
          variant='outline'>
          <RefreshCw className={cn("h-4 w-4", isRetrying && "animate-spin")} />
          {processing
            ? t("stats.match.checkAgain")
            : t("stats.dashboard.broken.retry")}
        </Button>
        <Button asChild variant='ghost'>
          <Link to='/stats'>{t("stats.match.backToStats")}</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
};
