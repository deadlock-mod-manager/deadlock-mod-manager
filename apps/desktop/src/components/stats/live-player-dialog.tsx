import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@deadlock-mods/ui/components/avatar";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { Card } from "@deadlock-mods/ui/components/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@deadlock-mods/ui/components/chart";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import { usePlayerHistory } from "@/hooks/use-player-stats";
import type { DeadlockHero } from "@/lib/deadlock-api";
import {
  type PlayerHeroStats,
  type PlayerRank,
  type RankAsset,
  resolveRank,
  type SteamProfile,
} from "@/lib/stats/api";
import { chronological, formCurve, isWin, summarize } from "@/lib/stats/derive";
import {
  formatCompact,
  formatDecimal,
  formatDayTick,
  formatPercent,
} from "@/lib/stats/format";
import { heroStatsByAccount, type LivePlayer } from "@/lib/stats/live";
import { cn } from "@/lib/utils";

const FORM_WINDOW = 10;
const RECENT_MATCHES = 12;
const TOP_HEROES = 6;

interface LivePlayerDialogProps {
  player: LivePlayer | null;
  profile: SteamProfile | undefined;
  rank: PlayerRank | undefined;
  rankAssets: RankAsset[];
  heroStats: PlayerHeroStats[];
  heroesById: Map<number, DeadlockHero>;
  onOpenChange: (open: boolean) => void;
}

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

/** Everything worth knowing about one player in the current lobby. */
export const LivePlayerDialog = ({
  player,
  profile,
  rank,
  rankAssets,
  heroStats,
  heroesById,
  onOpenChange,
}: LivePlayerDialogProps) => {
  const { t, i18n } = useTranslation();
  const history = usePlayerHistory(player?.accountId ?? null);

  const mine = useMemo(
    () =>
      player ? (heroStatsByAccount(heroStats).get(player.accountId) ?? []) : [],
    [heroStats, player],
  );

  const form = useMemo(
    () => formCurve(history.matches, FORM_WINDOW),
    [history.matches],
  );

  const recent = useMemo(
    () => chronological(history.matches).slice(-RECENT_MATCHES),
    [history.matches],
  );

  const topHeroes = useMemo(
    () =>
      [...mine]
        .sort((a, b) => b.matches_played - a.matches_played)
        .slice(0, TOP_HEROES)
        .map((entry) => ({
          heroId: entry.hero_id,
          name: heroesById.get(entry.hero_id)?.name ?? `#${entry.hero_id}`,
          winrate: (entry.wins / entry.matches_played) * 100,
          matches: entry.matches_played,
        })),
    [mine, heroesById],
  );

  if (!player) {
    return null;
  }

  const onCurrentHero = mine.find((entry) => entry.hero_id === player.heroId);
  const totals = mine.reduce(
    (sum, entry) => ({
      matches: sum.matches + entry.matches_played,
      wins: sum.wins + entry.wins,
      kills: sum.kills + entry.kills,
      deaths: sum.deaths + entry.deaths,
      assists: sum.assists + entry.assists,
    }),
    { matches: 0, wins: 0, kills: 0, deaths: 0, assists: 0 },
  );

  const recentForm = summarize(recent);
  const badge = resolveRank(rank?.badge, rankAssets);
  const hero = heroesById.get(player.heroId);

  const formConfig = {
    winrate: { label: t("stats.charts.winrate"), color: "var(--viz-series-1)" },
  } satisfies ChartConfig;

  const heroConfig = {
    winrate: { label: t("stats.charts.winrate") },
  } satisfies ChartConfig;

  return (
    <Dialog onOpenChange={onOpenChange} open={player !== null}>
      <DialogContent className='max-h-[85vh] max-w-3xl overflow-y-auto'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-3'>
            <Avatar className='h-12 w-12'>
              {profile?.avatarfull && (
                <AvatarImage alt='' src={profile.avatarfull} />
              )}
              <AvatarFallback>
                {profile?.personaname?.charAt(0) ?? "?"}
              </AvatarFallback>
            </Avatar>
            <div className='min-w-0'>
              <div className='truncate'>
                {profile?.personaname ?? `#${player.accountId}`}
              </div>
              <div className='flex items-center gap-1.5 font-normal text-muted-foreground text-xs'>
                {badge.image && (
                  <img
                    alt=''
                    className='h-4 w-4 object-contain'
                    src={badge.image}
                  />
                )}
                <span>{badge.name ?? t("stats.unranked")}</span>
                {badge.subrank > 0 && <span>{badge.subrank}</span>}
                <span aria-hidden>·</span>
                <span className='tabular-nums'>{player.accountId}</span>
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className='flex items-center gap-3 rounded-lg border p-3'>
          <HeroAvatar
            className='h-11 w-11'
            hero={hero}
            heroId={player.heroId}
          />
          <div className='min-w-0 flex-1'>
            <div className='font-medium'>
              {hero?.name ?? `#${player.heroId}`}
            </div>
            <div className='text-muted-foreground text-xs'>
              {onCurrentHero
                ? t("stats.live.onHero", {
                    matches: onCurrentHero.matches_played,
                    winrate: formatPercent(
                      onCurrentHero.wins / onCurrentHero.matches_played,
                      0,
                    ),
                  })
                : t("stats.live.firstTimeHero")}
            </div>
          </div>
          <Badge className='shrink-0' variant='secondary'>
            {player.kills}/{player.deaths}/{player.assists}
          </Badge>
        </div>

        <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
          <Metric
            hint={t("stats.live.matchesTracked")}
            label={t("stats.live.overallWinrate")}
            value={
              totals.matches > 0
                ? formatPercent(totals.wins / totals.matches, 0)
                : "-"
            }
          />
          <Metric
            hint={t("stats.live.lastN", { count: RECENT_MATCHES })}
            label={t("stats.live.recentForm")}
            value={
              recent.length > 0 ? formatPercent(recentForm.winrate, 0) : "-"
            }
          />
          <Metric
            hint={`${formatDecimal(totals.kills / Math.max(totals.matches, 1), 1)} / ${formatDecimal(totals.deaths / Math.max(totals.matches, 1), 1)} / ${formatDecimal(totals.assists / Math.max(totals.matches, 1), 1)}`}
            label={t("stats.live.overallKda")}
            value={formatDecimal(
              (totals.kills + totals.assists) / Math.max(totals.deaths, 1),
            )}
          />
          <Metric
            hint={t("stats.live.netWorthHint")}
            label={t("stats.live.netWorth")}
            value={formatCompact(player.netWorth)}
          />
        </div>

        {history.isPending ? (
          <Skeleton className='h-[180px] w-full rounded-xl' />
        ) : (
          form.length > 1 && (
            <Section
              description={t("stats.live.formDescription", {
                window: FORM_WINDOW,
              })}
              title={t("stats.live.formTitle")}>
              <ChartContainer
                className='aspect-auto h-[160px] w-full'
                config={formConfig}>
                <AreaChart data={form} margin={{ left: 4, right: 8, top: 4 }}>
                  <defs>
                    <linearGradient
                      id='livePlayerForm'
                      x1='0'
                      x2='0'
                      y1='0'
                      y2='1'>
                      <stop
                        offset='0%'
                        stopColor='var(--color-winrate)'
                        stopOpacity={0.18}
                      />
                      <stop
                        offset='100%'
                        stopColor='var(--color-winrate)'
                        stopOpacity={0.02}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    stroke='hsl(var(--chart-grid))'
                    vertical={false}
                  />
                  <XAxis
                    axisLine={false}
                    dataKey='startTime'
                    domain={["dataMin", "dataMax"]}
                    minTickGap={48}
                    tickFormatter={(value: number) =>
                      formatDayTick(value, i18n.language)
                    }
                    tickLine={false}
                    type='number'
                  />
                  <YAxis
                    axisLine={false}
                    domain={[0, 100]}
                    tickFormatter={(value: number) => `${value}%`}
                    tickLine={false}
                    ticks={[0, 50, 100]}
                    width={36}
                  />
                  <ReferenceLine
                    stroke='hsl(var(--muted-foreground))'
                    strokeDasharray='4 4'
                    y={50}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => (
                          <span className='font-medium'>
                            {formatPercent(Number(value) / 100, 0)}
                          </span>
                        )}
                        labelFormatter={(_, payload) =>
                          formatDayTick(
                            Number(payload?.[0]?.payload?.startTime ?? 0),
                            i18n.language,
                          )
                        }
                      />
                    }
                  />
                  <Area
                    dataKey='winrate'
                    dot={false}
                    fill='url(#livePlayerForm)'
                    stroke='var(--color-winrate)'
                    strokeWidth={2}
                    type='monotone'
                  />
                </AreaChart>
              </ChartContainer>
            </Section>
          )
        )}

        {recent.length > 0 && (
          <Section title={t("stats.live.recentMatches")}>
            <div className='flex flex-wrap gap-1.5'>
              {/* Newest first; `recent` is already a copy, but reverse mutates. */}
              {[...recent].toReversed().map((match) => (
                <Tooltip key={match.match_id}>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        "rounded-md border-2 p-0.5",
                        isWin(match)
                          ? "border-emerald-500/60"
                          : "border-destructive/60",
                      )}>
                      <HeroAvatar
                        className='h-7 w-7'
                        hero={heroesById.get(match.hero_id)}
                        heroId={match.hero_id}
                      />
                    </div>
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

        {topHeroes.length > 0 && (
          <Section
            description={t("stats.live.mostPlayedDescription")}
            title={t("stats.live.mostPlayed")}>
            <ChartContainer
              className='aspect-auto w-full'
              config={heroConfig}
              style={{ height: `${Math.max(140, topHeroes.length * 28)}px` }}>
              <BarChart
                data={topHeroes}
                layout='vertical'
                margin={{ left: 4, right: 40, top: 4, bottom: 4 }}>
                <XAxis
                  axisLine={false}
                  domain={[0, 100]}
                  tickFormatter={(value: number) => `${value}%`}
                  tickLine={false}
                  ticks={[0, 50, 100]}
                  type='number'
                />
                <YAxis
                  axisLine={false}
                  dataKey='name'
                  // Without this recharts thins the ticks out and half the
                  // heroes end up unlabelled.
                  interval={0}
                  tickLine={false}
                  type='category'
                  width={96}
                />
                <ReferenceLine stroke='hsl(var(--muted-foreground))' x={50} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      hideIndicator
                      formatter={(_value, _name, item) => (
                        <span className='font-medium'>
                          {t("stats.live.onHeroShort", {
                            matches: Number(item?.payload?.matches ?? 0),
                            winrate: formatPercent(
                              Number(item?.payload?.winrate ?? 0) / 100,
                              0,
                            ),
                          })}
                        </span>
                      )}
                      labelFormatter={(_, payload) =>
                        String(payload?.[0]?.payload?.name ?? "")
                      }
                    />
                  }
                  cursor={{ fill: "hsl(var(--accent))" }}
                />
                <Bar dataKey='winrate' maxBarSize={16} radius={4}>
                  {topHeroes.map((entry) => (
                    <Cell
                      fill={
                        entry.winrate >= 50
                          ? "var(--viz-positive)"
                          : "var(--viz-negative)"
                      }
                      key={entry.heroId}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </Section>
        )}
      </DialogContent>
    </Dialog>
  );
};
