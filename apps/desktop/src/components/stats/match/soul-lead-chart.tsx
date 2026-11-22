import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
} from "@deadlock-mods/ui/components/chart";
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
import { PillLabel, tint } from "@/components/stats/chart-fx";
import { teamColor } from "@/components/stats/match/item-tile";
import type { MatchMetadataPlayer } from "@/lib/stats/api";
import { formatClock, formatCompact } from "@/lib/stats/format";
import {
  killTimeline,
  leadStory,
  type LeadPoint,
  soulLead,
} from "@/lib/stats/match-analysis";
import { TeamKey } from "./match-team-key";

const signedSouls = (value: number) =>
  `${value > 0 ? "+" : value < 0 ? "-" : ""}${formatCompact(Math.abs(value))}`;

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
