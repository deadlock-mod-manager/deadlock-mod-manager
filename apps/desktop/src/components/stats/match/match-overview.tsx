import { Card } from "@deadlock-mods/ui/components/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
} from "@deadlock-mods/ui/components/chart";
import { Crown } from "@deadlock-mods/ui/icons";
import { useId, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Area,
  AreaChart,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "@/components/stats/chart-card";
import { HERO_TILE_CLASS, PillLabel, tint } from "@/components/stats/chart-fx";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import {
  ItemTile,
  TeamLabel,
  teamColor,
} from "@/components/stats/match/item-tile";
import type { DeadlockHero, DeadlockItem } from "@/lib/deadlock-api";
import type {
  MatchMetadata,
  MatchMetadataPlayer,
  SteamProfile,
} from "@/lib/stats/api";
import { formatClock, formatCompact, formatPercent } from "@/lib/stats/format";
import {
  killTimeline,
  lastStat,
  leadStory,
  type LeadPoint,
  type Placement,
  type PlacementMetric,
  purchases,
  soulLead,
} from "@/lib/stats/match-analysis";
import { cn } from "@/lib/utils";

const TEAMS = [0, 1] as const;
const BUILD_SHOWN = 9;

const signedSouls = (value: number) =>
  `${value > 0 ? "+" : value < 0 ? "-" : ""}${formatCompact(Math.abs(value))}`;

const TeamKey = () => {
  const { t } = useTranslation();
  return (
    <div className='flex shrink-0 items-center gap-4 text-[11.5px] text-muted-foreground'>
      {TEAMS.map((team) => (
        <span className='flex items-center gap-1.5' key={team}>
          <span
            className='h-2.5 w-2.5 rounded-[3px]'
            style={{ backgroundColor: teamColor(team) }}
          />
          {t(`stats.match.teams.${team}`)}
        </span>
      ))}
    </div>
  );
};

/**
 * The match in one line: how far ahead each team was at every sample, shaded in
 * the colour of whoever led, with every kill ticked underneath.
 */
export const SoulLeadChart = ({
  players,
  duration,
  myTeam,
}: {
  players: MatchMetadataPlayer[];
  duration: number;
  myTeam: number;
}) => {
  const { t } = useTranslation();
  const fillId = useId();
  const { points, kills, limit, story, last, zeroStop } = useMemo(() => {
    const lead = soulLead(players);
    const top = Math.max(0, ...lead.map((point) => point.lead));
    const bottom = Math.min(0, ...lead.map((point) => point.lead));
    return {
      points: lead,
      kills: killTimeline(players),
      // Symmetric, so the two teams' leads read on the same scale.
      limit: Math.ceil((Math.max(top, -bottom, 1000) * 1.15) / 4000) * 4000,
      story: leadStory(lead),
      last: lead[lead.length - 1] ?? { time: 0, lead: 0 },
      // The fill gradient spans the area's own box (highest lead to deepest
      // deficit), so zero sits wherever it falls inside that range.
      zeroStop: top - bottom > 0 ? top / (top - bottom) : 0.5,
    };
  }, [players]);

  const config = {
    lead: { label: t("stats.match.soulLead"), color: "hsl(var(--foreground))" },
  } satisfies ChartConfig;
  const ticks = Array.from(
    { length: Math.floor(duration / 300) + 1 },
    (_, index) => index * 300,
  );

  return (
    <ChartCard
      action={<TeamKey />}
      description={t("stats.match.soulLeadDescription")}
      title={t("stats.match.soulLead")}>
      <div className='flex h-full min-h-[260px] flex-col gap-2'>
        <div className='stats-dot-grid relative min-h-[170px] flex-1 rounded-md'>
          <ChartContainer
            className='stats-chart absolute inset-0 aspect-auto h-full w-full [--ref-stroke:hsl(var(--foreground))]'
            config={config}>
            <AreaChart
              data={points}
              margin={{ top: 14, right: 0, bottom: 8, left: 0 }}>
              <defs>
                <linearGradient id={fillId} x1='0' x2='0' y1='0' y2='1'>
                  <stop offset={0} stopColor={teamColor(0)} stopOpacity={0.4} />
                  <stop
                    offset={zeroStop}
                    stopColor={teamColor(0)}
                    stopOpacity={0.04}
                  />
                  <stop
                    offset={zeroStop}
                    stopColor={teamColor(1)}
                    stopOpacity={0.04}
                  />
                  <stop offset={1} stopColor={teamColor(1)} stopOpacity={0.4} />
                </linearGradient>
              </defs>
              <XAxis dataKey='time' domain={[0, duration]} hide type='number' />
              <YAxis
                axisLine={false}
                domain={[-limit, limit]}
                orientation='right'
                tickFormatter={(value: number) => signedSouls(value)}
                tickLine={false}
                ticks={[-limit, -limit / 2, 0, limit / 2, limit]}
                width={44}
              />
              <ReferenceLine
                stroke='hsl(var(--foreground))'
                strokeOpacity={0.18}
                y={0}
              />
              {story.swing && (
                <ReferenceLine
                  label={{
                    value: t(
                      story.swing.team === myTeam
                        ? "stats.match.leadTaken"
                        : "stats.match.leadLost",
                      { time: formatClock(story.swing.time) },
                    ),
                    position: "insideTopRight",
                    className: "fill-muted-foreground font-mono text-[10.5px]",
                  }}
                  stroke='hsl(var(--foreground))'
                  strokeOpacity={0.15}
                  x={story.swing.time}
                />
              )}
              <ChartTooltip
                content={({ active, payload }) => {
                  const point: LeadPoint | undefined = payload?.[0]?.payload;
                  if (!active || !point) return null;
                  const team = point.lead >= 0 ? 0 : 1;
                  return (
                    <div className='rounded-lg border border-border/60 bg-popover px-2.5 py-1.5 text-xs shadow-lg'>
                      <div className='font-mono text-muted-foreground'>
                        {formatClock(point.time)}
                      </div>
                      <div
                        className='font-medium'
                        style={{ color: teamColor(team) }}>
                        {point.lead === 0
                          ? t("stats.match.even")
                          : t("stats.match.teamAhead", {
                              team: t(`stats.match.teams.${team}`),
                              souls: formatCompact(Math.abs(point.lead)),
                            })}
                      </div>
                    </div>
                  );
                }}
                cursor={{
                  stroke: "hsl(var(--foreground))",
                  strokeOpacity: 0.2,
                }}
              />
              <Area
                activeDot={{
                  r: 4,
                  fill: "hsl(var(--card))",
                  stroke: "var(--color-lead)",
                  strokeWidth: 2,
                }}
                baseValue={0}
                dataKey='lead'
                dot={false}
                fill={`url(#${fillId})`}
                isAnimationActive={false}
                stroke='var(--color-lead)'
                strokeOpacity={0.85}
                strokeWidth={1.8}
                type='monotone'
              />
              {story.peaks.map((peak) => (
                <ReferenceDot
                  fill='hsl(var(--card))'
                  key={peak.team}
                  label={
                    <PillLabel
                      color={teamColor(peak.team)}
                      placement={peak.team === 0 ? "above" : "below"}
                      text={t("stats.match.peak", {
                        souls: signedSouls(Math.abs(peak.lead)),
                        time: formatClock(peak.time),
                      })}
                    />
                  }
                  r={3.5}
                  stroke={teamColor(peak.team)}
                  strokeWidth={2}
                  x={peak.time}
                  y={peak.lead}
                />
              ))}
              <ReferenceDot
                fill={teamColor(last.lead >= 0 ? 0 : 1)}
                label={
                  <PillLabel
                    color={teamColor(last.lead >= 0 ? 0 : 1)}
                    placement='left'
                    text={t("stats.match.teamAhead", {
                      team: t(`stats.match.teams.${last.lead >= 0 ? 0 : 1}`),
                      souls: formatCompact(Math.abs(last.lead)),
                    })}
                  />
                }
                r={4}
                stroke='hsl(var(--card))'
                strokeWidth={2}
                x={last.time}
                y={last.lead}
              />
            </AreaChart>
          </ChartContainer>
        </div>
        <div aria-hidden className='relative mr-11 h-[26px]'>
          {kills.map((kill) => (
            <span
              className='absolute h-3 w-0.5 rounded-full'
              key={`${kill.victim}-${kill.time}`}
              style={{
                left: `${(kill.time / duration) * 100}%`,
                top: kill.team === 0 ? 0 : 14,
                backgroundColor: tint(teamColor(kill.team), 70),
              }}
            />
          ))}
        </div>
        <div className='relative mr-11 h-3 font-mono text-[10px] text-muted-foreground/70'>
          {ticks.map((tick) => (
            <span
              className='absolute -translate-x-1/2 first:translate-x-0'
              key={tick}
              style={{ left: `${(tick / duration) * 100}%` }}>
              {formatClock(tick)}
            </span>
          ))}
        </div>
      </div>
    </ChartCard>
  );
};

const formatPlacement = (metric: PlacementMetric, value: number) =>
  metric === "accuracy"
    ? formatPercent(value, 0)
    : metric === "deaths"
      ? String(value)
      : formatCompact(value);

/** The player's finish on each metric, with the whole lobby as a strip of slots. */
export const LobbyPlacements = ({
  placements,
}: {
  placements: Placement[];
}) => {
  const { t } = useTranslation();
  return (
    <ChartCard
      description={t("stats.match.placementsDescription", {
        count: placements[0]?.order.length ?? 0,
      })}
      title={t("stats.match.placements")}>
      <div className='flex h-full flex-col gap-3.5'>
        {placements.map((placement) => {
          const top = placement.rank <= 3;
          return (
            <div className='flex flex-col gap-1.5' key={placement.metric}>
              <div className='flex items-center justify-between gap-2'>
                <span className='flex items-baseline gap-2'>
                  <span className='font-medium text-[12.5px]'>
                    {t(`stats.match.metrics.${placement.metric}`)}
                  </span>
                  <span className='font-mono text-muted-foreground text-xs'>
                    {formatPlacement(placement.metric, placement.value)}
                  </span>
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 font-mono font-semibold text-[11px]",
                    top
                      ? "bg-primary/10 text-primary"
                      : "bg-foreground/5 text-muted-foreground",
                  )}>
                  {t("stats.match.placeOf", {
                    count: placement.rank,
                    ordinal: true,
                    total: placement.order.length,
                  })}
                </span>
              </div>
              <div aria-hidden className='flex h-2.5 gap-[3px]'>
                {placement.order.map((slot) => (
                  <span
                    className='flex-1 rounded-[3px]'
                    key={slot.slot}
                    style={
                      slot.isMe
                        ? {
                            // Foreground, not primary: a theme's primary can sit
                            // too close to a team colour to stand out.
                            backgroundColor: "hsl(var(--foreground))",
                            boxShadow:
                              "0 0 6px color-mix(in srgb, hsl(var(--foreground)) 55%, transparent)",
                          }
                        : { backgroundColor: tint(teamColor(slot.team), 24) }
                    }
                  />
                ))}
              </div>
            </div>
          );
        })}
        <div className='mt-auto flex justify-between font-mono text-[10px] text-muted-foreground/70'>
          <span>{t("stats.match.best")}</span>
          <span>{t("stats.match.worst")}</span>
        </div>
      </div>
    </ChartCard>
  );
};

const BarCell = ({
  value,
  max,
  color,
}: {
  value: number;
  max: number;
  color: string;
}) => (
  <div className='flex flex-col gap-1.5'>
    <span className='flex items-center gap-1.5 font-mono font-semibold text-[12.5px] tabular-nums'>
      {formatCompact(value)}
      {value === max && value > 0 && (
        <Crown aria-hidden className='h-3 w-3 text-primary' />
      )}
    </span>
    <div className='h-1 w-full max-w-[120px] overflow-hidden rounded-full bg-foreground/5'>
      <div
        className='h-full rounded-full'
        style={{
          width: `${max > 0 ? (value / max) * 100 : 0}%`,
          backgroundColor: value === max ? color : tint(color, 60),
        }}
      />
    </div>
  </div>
);

const GRID =
  "grid grid-cols-[minmax(180px,1.6fr)_88px_minmax(110px,1fr)_minmax(110px,1fr)_72px_76px_minmax(230px,2fr)] items-center gap-4";

interface ScoreboardProps {
  match: MatchMetadata["match_info"];
  meId: number;
  heroesById: Map<number, DeadlockHero>;
  itemsById: Map<number, DeadlockItem>;
  profiles: Map<number, SteamProfile>;
  onSelectPlayer: (accountId: number) => void;
}

/** Both teams, the player's row tinted, the lobby's best in each stat crowned. */
export const Scoreboard = ({
  match,
  meId,
  heroesById,
  itemsById,
  profiles,
  onSelectPlayer,
}: ScoreboardProps) => {
  const { t } = useTranslation();
  const { players } = match;
  const max = {
    souls: Math.max(...players.map((player) => player.net_worth)),
    damage: Math.max(
      ...players.map((player) => lastStat(player)?.player_damage ?? 0),
    ),
    healing: Math.max(
      ...players.map((player) => lastStat(player)?.player_healing ?? 0),
    ),
  };

  return (
    <div className='flex flex-col gap-4'>
      {TEAMS.map((team) => {
        const members = players.filter((player) => player.team === team);
        const won = match.winning_team === team;
        const souls = members.reduce(
          (sum, player) => sum + player.net_worth,
          0,
        );
        const kills = members.reduce((sum, player) => sum + player.kills, 0);
        return (
          <Card
            className='stats-surface overflow-hidden shadow-none'
            key={team}>
            <div
              className='flex flex-wrap items-center justify-between gap-3 border-border/60 border-b px-5 py-3.5'
              style={{ backgroundColor: tint(teamColor(team), 6) }}>
              <TeamLabel team={team} won={won} />
              <div className='flex items-center gap-5 text-[11.5px] text-muted-foreground'>
                <span>
                  {t("stats.match.kills")}{" "}
                  <span className='font-mono font-semibold text-foreground'>
                    {kills}
                  </span>
                </span>
                <span>
                  {t("stats.match.souls")}{" "}
                  <span className='font-mono font-semibold text-foreground'>
                    {formatCompact(souls)}
                  </span>
                </span>
              </div>
            </div>
            <div className='overflow-x-auto'>
              <div className='min-w-[1000px]'>
                <div
                  className={cn(
                    GRID,
                    "px-5 py-2 font-semibold text-[10px] text-muted-foreground/70 uppercase tracking-[0.1em]",
                  )}>
                  <span>{t("stats.match.columns.player")}</span>
                  <span>{t("stats.match.columns.kda")}</span>
                  <span>{t("stats.match.columns.souls")}</span>
                  <span>{t("stats.match.columns.damage")}</span>
                  <span>{t("stats.match.columns.healing")}</span>
                  <span>{t("stats.match.columns.lastHits")}</span>
                  <span>{t("stats.match.columns.build")}</span>
                </div>
                {members.map((player) => {
                  const isMe = player.account_id === meId;
                  const hero = heroesById.get(player.hero_id);
                  const name =
                    profiles.get(player.account_id)?.personaname ??
                    t("stats.unknownPlayer");
                  const build = purchases(player.items, itemsById).filter(
                    (purchase) => purchase.soldAt === null,
                  );
                  const healing = lastStat(player)?.player_healing ?? 0;
                  return (
                    <div
                      className={cn(
                        GRID,
                        "border-border/50 border-t px-5 py-2.5",
                        isMe && "bg-primary/[0.05]",
                      )}
                      key={player.account_id}>
                      <button
                        className='flex min-w-0 cursor-pointer items-center gap-2.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                        onClick={() => onSelectPlayer(player.account_id)}
                        type='button'>
                        <span className='relative shrink-0'>
                          <HeroAvatar
                            className={cn(
                              "h-9 w-9",
                              HERO_TILE_CLASS,
                              isMe && "ring-[1.5px] ring-primary/60",
                            )}
                            hero={hero}
                            heroId={player.hero_id}
                          />
                          <span className='absolute -right-1 -bottom-1 flex h-3.5 min-w-[18px] items-center justify-center rounded border border-border bg-background px-0.5 font-bold font-mono text-[8.5px]'>
                            {player.level}
                          </span>
                        </span>
                        <span className='flex min-w-0 flex-col'>
                          <span className='flex items-center gap-1.5'>
                            <span className='truncate font-medium text-[13px] hover:underline'>
                              {name}
                            </span>
                            {isMe && (
                              <span className='rounded-full bg-primary px-1.5 font-bold text-[10px] text-primary-foreground'>
                                {t("stats.match.you")}
                              </span>
                            )}
                          </span>
                          <span className='truncate text-[11.5px] text-muted-foreground'>
                            {hero?.name ?? `#${player.hero_id}`}
                          </span>
                        </span>
                      </button>
                      <span className='font-mono font-semibold text-[13px]'>
                        {player.kills}/{player.deaths}/{player.assists}
                      </span>
                      <BarCell
                        color={teamColor(team)}
                        max={max.souls}
                        value={player.net_worth}
                      />
                      <BarCell
                        color='hsl(var(--primary))'
                        max={max.damage}
                        value={lastStat(player)?.player_damage ?? 0}
                      />
                      <span className='flex items-center gap-1.5 font-mono font-semibold text-[12.5px]'>
                        {formatCompact(healing)}
                        {healing === max.healing && healing > 0 && (
                          <Crown aria-hidden className='h-3 w-3 text-primary' />
                        )}
                      </span>
                      <span className='font-mono text-[12.5px] text-foreground/80'>
                        {player.last_hits} / {player.denies}
                      </span>
                      <div className='flex items-center gap-[3px]'>
                        {build.slice(-BUILD_SHOWN).map((purchase) => (
                          <ItemTile
                            className='h-6 w-6'
                            hint={formatClock(purchase.time)}
                            item={purchase.item}
                            key={`${purchase.item.id}-${purchase.time}`}
                          />
                        ))}
                        {build.length > BUILD_SHOWN && (
                          <span className='pl-0.5 font-mono text-[10.5px] text-muted-foreground'>
                            +{build.length - BUILD_SHOWN}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
};
