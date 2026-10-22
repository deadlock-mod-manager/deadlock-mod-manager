import { Card } from "@deadlock-mods/ui/components/card";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ChartCard } from "@/components/stats/chart-card";
import {
  HERO_TILE_CLASS,
  LOSS_COLOR,
  tint,
  WIN_COLOR,
} from "@/components/stats/chart-fx";
import { FormChart } from "@/components/stats/form-chart";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import { HeroPool } from "@/components/stats/hero-pool";
import { WinrateRing } from "@/components/stats/trend-strip";
import type { DeadlockHero } from "@/lib/deadlock-api";
import type { MatchHistoryEntry, PlayerHeroStats } from "@/lib/stats/api";
import { heroPerformance, isWin, summarize } from "@/lib/stats/derive";
import {
  formatCompact,
  formatDecimal,
  formatPercent,
} from "@/lib/stats/format";
import { cn } from "@/lib/utils";

const FORM_WINDOW = 10;
const FORM_SHOWN = 80;
const RECENT_MATCHES = 12;

const StripCell = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) => (
  <div className='flex min-w-0 flex-col gap-1.5 border-border/70 border-t p-5 sm:border-t-0 sm:border-l'>
    <span className='font-semibold text-[10.5px] text-muted-foreground uppercase tracking-[0.12em]'>
      {label}
    </span>
    <span className='font-bold text-2xl leading-none tracking-tight tabular-nums'>
      {value}
    </span>
    <span className='truncate font-mono text-[10.5px] text-muted-foreground/80'>
      {hint}
    </span>
  </div>
);

interface PlayerCareerOverviewProps {
  matches: MatchHistoryEntry[];
  heroStats: PlayerHeroStats[];
  heroesById: Map<number, DeadlockHero>;
  isPending: boolean;
  isHeroStatsPending: boolean;
  onSelectMatch: (matchId: number) => void;
  onSelectHero: (heroId: number) => void;
}

export const PlayerCareerOverview = ({
  matches,
  heroStats,
  heroesById,
  isPending,
  isHeroStatsPending,
  onSelectMatch,
  onSelectHero,
}: PlayerCareerOverviewProps) => {
  const { t } = useTranslation();
  const recent = useMemo(() => matches.slice(0, RECENT_MATCHES), [matches]);
  const heroes = useMemo(() => heroPerformance(heroStats), [heroStats]);
  const totals = useMemo(() => {
    const sum = heroStats.reduce(
      (total, entry) => ({
        matches: total.matches + entry.matches_played,
        wins: total.wins + entry.wins,
        kills: total.kills + entry.kills,
        deaths: total.deaths + entry.deaths,
        assists: total.assists + entry.assists,
        minutes: total.minutes + entry.time_played / 60,
        souls: total.souls + entry.networth_per_min * (entry.time_played / 60),
      }),
      {
        matches: 0,
        wins: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        minutes: 0,
        souls: 0,
      },
    );
    return {
      ...sum,
      winrate: sum.matches > 0 ? sum.wins / sum.matches : 0,
      soulsPerMin: sum.minutes > 0 ? sum.souls / sum.minutes : 0,
      perMatch: (value: number) => value / Math.max(sum.matches, 1),
    };
  }, [heroStats]);
  const recentForm = summarize(recent);

  return (
    <div className='flex flex-col gap-4 p-5'>
      {isHeroStatsPending ? (
        <Skeleton className='h-[112px] w-full rounded-xl' />
      ) : (
        <Card className='stats-surface grid overflow-hidden shadow-none sm:grid-cols-[minmax(250px,1.3fr)_repeat(3,minmax(0,1fr))]'>
          <div className='flex items-center gap-4 p-4'>
            <div className='relative shrink-0'>
              <WinrateRing winrate={totals.winrate} />
              <div className='absolute inset-0 flex flex-col items-center justify-center'>
                <span className='font-bold text-lg leading-none tabular-nums'>
                  {formatPercent(totals.winrate, 0)}
                </span>
                <span className='mt-1 font-mono text-[9px] text-muted-foreground'>
                  {t("stats.player.overallShort")}
                </span>
              </div>
            </div>
            <div className='flex min-w-0 flex-col gap-1.5'>
              <span className='font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.12em]'>
                {t("stats.player.recentFormLabel", { count: recent.length })}
              </span>
              {/* Newest first in the data; drawn right to left so it reads oldest to latest. */}
              <div
                aria-hidden
                className='flex h-5 flex-row-reverse items-end justify-end gap-[3px]'>
                {recent.map((match) => (
                  <span
                    className={cn(
                      "w-2 rounded-[2px]",
                      isWin(match) ? "h-full" : "h-1/2",
                    )}
                    key={match.match_id}
                    style={{
                      backgroundColor: isWin(match)
                        ? tint(WIN_COLOR, 80)
                        : tint(LOSS_COLOR, 70),
                    }}
                  />
                ))}
              </div>
              {recent.length > 0 && (
                <span
                  className='font-mono font-semibold text-[11px]'
                  style={{
                    color:
                      recentForm.winrate >= totals.winrate
                        ? WIN_COLOR
                        : LOSS_COLOR,
                  }}>
                  {t("stats.player.recentRecord", {
                    wins: recentForm.wins,
                    losses: recentForm.matches - recentForm.wins,
                    winrate: formatPercent(recentForm.winrate, 0),
                  })}
                </span>
              )}
            </div>
          </div>
          <StripCell
            hint={`${formatDecimal(totals.perMatch(totals.kills), 1)} / ${formatDecimal(totals.perMatch(totals.deaths), 1)} / ${formatDecimal(totals.perMatch(totals.assists), 1)}`}
            label={t("stats.player.overallKda")}
            value={formatDecimal(
              (totals.kills + totals.assists) / Math.max(totals.deaths, 1),
              2,
            )}
          />
          <StripCell
            hint={t("stats.player.soulsHint")}
            label={t("stats.heroes.souls")}
            value={formatCompact(totals.soulsPerMin)}
          />
          <StripCell
            hint={t("stats.player.trackedMatchesHint")}
            label={t("stats.player.trackedMatches")}
            value={String(totals.matches)}
          />
        </Card>
      )}

      {isPending ? (
        <Skeleton className='h-[300px] w-full rounded-xl' />
      ) : (
        matches.length > FORM_WINDOW && (
          <FormChart
            heroesById={heroesById}
            matches={matches}
            shown={FORM_SHOWN}
            window={FORM_WINDOW}
          />
        )
      )}

      <div className='grid gap-4 lg:grid-cols-[1fr_340px]'>
        {recent.length > 0 && (
          <ChartCard
            description={t("stats.player.recentDescription", {
              count: recent.length,
            })}
            title={t("stats.player.recentMatches")}>
            <div className='grid grid-cols-4 gap-2 sm:grid-cols-6'>
              {recent.map((match) => {
                const won = isWin(match);
                const color = won ? WIN_COLOR : LOSS_COLOR;
                const hero = heroesById.get(match.hero_id);
                return (
                  <Tooltip key={match.match_id}>
                    <TooltipTrigger asChild>
                      <button
                        aria-label={t("stats.player.openMatch", {
                          id: match.match_id,
                        })}
                        className='flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border bg-background px-1 pt-2 pb-1.5 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                        onClick={() => onSelectMatch(match.match_id)}
                        style={{ borderColor: tint(color, 30) }}
                        type='button'>
                        <HeroAvatar
                          className={cn("h-9 w-9", HERO_TILE_CLASS)}
                          hero={hero}
                          heroId={match.hero_id}
                        />
                        <span className='font-mono font-semibold text-[10.5px] tabular-nums'>
                          {match.player_kills}/{match.player_deaths}/
                          {match.player_assists}
                        </span>
                        <span
                          aria-hidden
                          className='h-[3px] w-6 rounded-full'
                          style={{ backgroundColor: color }}
                        />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {hero?.name ?? `#${match.hero_id}`},{" "}
                      {won ? t("stats.win") : t("stats.loss")},{" "}
                      {formatCompact(match.net_worth)}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </ChartCard>
        )}
        {isHeroStatsPending ? (
          <Skeleton className='h-[300px] w-full rounded-xl' />
        ) : (
          heroes.length > 0 && (
            <HeroPool
              heroes={heroes}
              heroesById={heroesById}
              onSelectHero={onSelectHero}
              showAllLink={false}
            />
          )
        )}
      </div>
    </div>
  );
};
