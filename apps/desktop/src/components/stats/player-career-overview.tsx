import { Card } from "@deadlock-mods/ui/components/card";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import { HeroWinrateBars } from "@/components/stats/hero-winrate-bars";
import { WinrateAreaChart } from "@/components/stats/winrate-area-chart";
import type { DeadlockHero } from "@/lib/deadlock-api";
import type { MatchHistoryEntry, PlayerHeroStats } from "@/lib/stats/api";
import { formCurve, isWin, summarize } from "@/lib/stats/derive";
import {
  formatCompact,
  formatDecimal,
  formatPercent,
} from "@/lib/stats/format";
import type { LivePlayer } from "@/lib/stats/live";
import { cn } from "@/lib/utils";

const FORM_WINDOW = 10;
const RECENT_MATCHES = 12;
const TOP_HEROES = 6;

const Metric = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) => (
  <Card className='flex flex-col gap-1 p-3 shadow-none'>
    <span className='text-muted-foreground text-xs'>{label}</span>
    <span className='font-semibold text-lg leading-none'>{value}</span>
    {hint && (
      <span className='truncate text-muted-foreground text-xs'>{hint}</span>
    )}
  </Card>
);

const Section = ({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) => (
  <section className='flex flex-col gap-2'>
    <div>
      <h3 className='font-semibold text-sm'>{title}</h3>
      {description && (
        <p className='text-muted-foreground text-xs'>{description}</p>
      )}
    </div>
    {children}
  </section>
);

interface PlayerCareerOverviewProps {
  matches: MatchHistoryEntry[];
  heroStats: PlayerHeroStats[];
  heroesById: Map<number, DeadlockHero>;
  isPending: boolean;
  isHeroStatsPending: boolean;
  live?: LivePlayer | null;
  onSelectMatch: (matchId: number) => void;
  onSelectHero: (heroId: number) => void;
}

export const PlayerCareerOverview = ({
  matches,
  heroStats,
  heroesById,
  isPending,
  isHeroStatsPending,
  live,
  onSelectMatch,
  onSelectHero,
}: PlayerCareerOverviewProps) => {
  const { t } = useTranslation();
  const form = useMemo(() => formCurve(matches, FORM_WINDOW), [matches]);
  const recent = useMemo(() => matches.slice(0, RECENT_MATCHES), [matches]);
  const topHeroes = useMemo(
    () =>
      [...heroStats]
        .sort((a, b) => b.matches_played - a.matches_played)
        .slice(0, TOP_HEROES)
        .map((entry) => ({
          heroId: entry.hero_id,
          name: heroesById.get(entry.hero_id)?.name ?? `#${entry.hero_id}`,
          winrate: (entry.wins / entry.matches_played) * 100,
          matches: entry.matches_played,
        })),
    [heroStats, heroesById],
  );
  const totals = useMemo(
    () =>
      heroStats.reduce(
        (sum, entry) => ({
          matches: sum.matches + entry.matches_played,
          wins: sum.wins + entry.wins,
          kills: sum.kills + entry.kills,
          deaths: sum.deaths + entry.deaths,
          assists: sum.assists + entry.assists,
        }),
        { matches: 0, wins: 0, kills: 0, deaths: 0, assists: 0 },
      ),
    [heroStats],
  );
  const recentForm = summarize(recent);

  return (
    <div className='flex flex-col gap-5 p-5'>
      <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
        <Metric
          hint={t("stats.player.trackedMatches")}
          label={t("stats.player.overallWinrate")}
          value={
            totals.matches > 0
              ? formatPercent(totals.wins / totals.matches, 0)
              : "-"
          }
        />
        <Metric
          hint={t("stats.player.lastN", { count: RECENT_MATCHES })}
          label={t("stats.player.recentForm")}
          value={recent.length > 0 ? formatPercent(recentForm.winrate, 0) : "-"}
        />
        <Metric
          hint={`${formatDecimal(totals.kills / Math.max(totals.matches, 1), 1)} / ${formatDecimal(totals.deaths / Math.max(totals.matches, 1), 1)} / ${formatDecimal(totals.assists / Math.max(totals.matches, 1), 1)}`}
          label={t("stats.player.overallKda")}
          value={formatDecimal(
            (totals.kills + totals.assists) / Math.max(totals.deaths, 1),
          )}
        />
        {live ? (
          <Metric
            hint={t("stats.player.netWorthHint")}
            label={t("stats.player.netWorth")}
            value={formatCompact(live.netWorth)}
          />
        ) : (
          <Metric
            hint={t("stats.player.trackedMatchesHint")}
            label={t("stats.player.trackedMatches")}
            value={String(totals.matches)}
          />
        )}
      </div>

      {isPending ? (
        <Skeleton className='h-[180px] w-full rounded-lg' />
      ) : (
        form.length > 1 && (
          <Section
            description={t("stats.player.formDescription", {
              window: FORM_WINDOW,
            })}
            title={t("stats.player.formTitle")}>
            <WinrateAreaChart data={form} heightPx={160} />
          </Section>
        )
      )}

      {recent.length > 0 && (
        <Section title={t("stats.player.recentMatches")}>
          <div className='flex flex-wrap gap-1.5'>
            {recent.map((match) => (
              <Tooltip key={match.match_id}>
                <TooltipTrigger asChild>
                  <button
                    aria-label={t("stats.player.openMatch", {
                      id: match.match_id,
                    })}
                    className={cn(
                      "rounded-md border-2 p-0.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isWin(match)
                        ? "border-emerald-500/60"
                        : "border-destructive/60",
                    )}
                    onClick={() => onSelectMatch(match.match_id)}
                    type='button'>
                    <HeroAvatar
                      className='h-7 w-7'
                      hero={heroesById.get(match.hero_id)}
                      heroId={match.hero_id}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {heroesById.get(match.hero_id)?.name ?? match.hero_id} ·{" "}
                  {match.player_kills}/{match.player_deaths}/
                  {match.player_assists} · {formatCompact(match.net_worth)}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </Section>
      )}

      {isHeroStatsPending ? (
        <Skeleton className='h-[180px] w-full rounded-lg' />
      ) : (
        topHeroes.length > 0 && (
          <Section
            description={t("stats.player.mostPlayedDescription")}
            title={t("stats.player.mostPlayed")}>
            {/* The bars take a click, but a recharts shape is not focusable -
                these portraits are the keyboard route to the same breakdown. */}
            <div className='flex flex-wrap gap-1.5'>
              {topHeroes.map((entry) => (
                <Tooltip key={entry.heroId}>
                  <TooltipTrigger asChild>
                    <button
                      aria-label={t("stats.hero.openHero", {
                        hero: entry.name,
                      })}
                      className='rounded-md p-0.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                      onClick={() => onSelectHero(entry.heroId)}
                      type='button'>
                      <HeroAvatar
                        className='h-7 w-7'
                        hero={heroesById.get(entry.heroId)}
                        heroId={entry.heroId}
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {t("stats.hero.openHero", { hero: entry.name })}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
            <HeroWinrateBars heroes={topHeroes} onSelect={onSelectHero} />
          </Section>
        )
      )}
    </div>
  );
};
