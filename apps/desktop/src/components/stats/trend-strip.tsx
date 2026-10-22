import { Card } from "@deadlock-mods/ui/components/card";
import { ChartContainer } from "@deadlock-mods/ui/components/chart";
import { useId, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Area, AreaChart, ReferenceLine, YAxis } from "recharts";
import {
  LOSS_COLOR,
  tint,
  VerticalFade,
  WIN_COLOR,
} from "@/components/stats/chart-fx";
import type { MatchHistoryEntry } from "@/lib/stats/api";
import {
  type BracketMetric,
  type BracketRow,
  median,
  PER_MATCH,
} from "@/lib/stats/benchmark";
import { chronological, isWin, summarize } from "@/lib/stats/derive";
import {
  formatCompact,
  formatDecimal,
  formatPercent,
} from "@/lib/stats/format";

/** The headline numbers - each the typical (median) match - cover the same games as the ring. */
const RECENT = 20;
/** Matches on each sparkline, and the rolling median that smooths it. */
const SPARK_MATCHES = 30;
const SPARK_SMOOTHING = 10;

type TrendMetric = Extract<
  BracketMetric,
  "kda" | "soulsPerMin" | "lastHits" | "deaths"
>;

const TREND_METRICS: Array<{
  metric: TrendMetric;
  format: (value: number) => string;
}> = [
  { metric: "kda", format: (value) => formatDecimal(value, 1) },
  { metric: "soulsPerMin", format: (value) => formatCompact(value) },
  { metric: "lastHits", format: (value) => formatCompact(value) },
  { metric: "deaths", format: (value) => formatDecimal(value, 1) },
];

/** A rolling median: steadier than a mean against the odd 20-kill stomp. */
const rollingMedian = (values: number[], window: number) =>
  values.map((_, index) =>
    median(values.slice(Math.max(0, index - window + 1), index + 1)),
  );

export const WinrateRing = ({ winrate }: { winrate: number }) => {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg
      aria-hidden
      className='h-[84px] w-[84px] -rotate-90'
      viewBox='0 0 84 84'>
      <circle
        cx={42}
        cy={42}
        fill='none'
        r={radius}
        stroke='hsl(var(--foreground))'
        strokeOpacity={0.07}
        strokeWidth={6}
      />
      <circle
        cx={42}
        cy={42}
        fill='none'
        r={radius}
        stroke={winrate >= 0.5 ? WIN_COLOR : LOSS_COLOR}
        strokeDasharray={`${circumference * winrate} ${circumference}`}
        strokeLinecap='round'
        strokeWidth={6}
        style={{
          filter: `drop-shadow(0 0 4px ${tint(winrate >= 0.5 ? WIN_COLOR : LOSS_COLOR, 50)})`,
        }}
      />
    </svg>
  );
};

const Sparkline = ({
  values,
  reference,
}: {
  values: number[];
  reference: number | null;
}) => {
  const fillId = useId();
  const data = values.map((value, index) => ({ index, value }));
  const lastIndex = data.length - 1;

  return (
    <ChartContainer
      className='stats-chart aspect-auto h-[34px] w-full'
      config={{ value: { label: "", color: "hsl(var(--primary))" } }}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 2, left: 0 }}>
        <defs>
          <VerticalFade color='var(--color-value)' from={0.2} id={fillId} />
        </defs>
        <YAxis
          domain={[
            (min: number) => Math.min(min, reference ?? min) * 0.95,
            (max: number) => Math.max(max, reference ?? max) * 1.05,
          ]}
          hide
        />
        {reference !== null && (
          <ReferenceLine
            stroke='hsl(var(--primary))'
            strokeDasharray='4 3'
            strokeOpacity={0.35}
            y={reference}
          />
        )}
        <Area
          dataKey='value'
          dot={({ cx, cy, index }) =>
            index === lastIndex && cx !== undefined && cy !== undefined ? (
              <circle
                cx={cx}
                cy={cy}
                fill='var(--color-value)'
                key='end'
                r={3}
                stroke='hsl(var(--card))'
                strokeWidth={1.5}
              />
            ) : (
              <g key={index} />
            )
          }
          fill={`url(#${fillId})`}
          isAnimationActive={false}
          stroke='var(--color-value)'
          strokeWidth={1.6}
          type='monotone'
        />
      </AreaChart>
    </ChartContainer>
  );
};

interface TrendStripProps {
  matches: MatchHistoryEntry[];
  /** The bracket comparison; empty while it loads or when it is unavailable. */
  bracket: BracketRow[];
  /** Name of the bracket the medians come from, `null` for everyone. */
  bracketName: string | null;
}

/**
 * The numbers that move from one evening to the next, each against the median
 * of the player's own rank, in one strip rather than a row of identical cards.
 */
export const TrendStrip = ({
  matches,
  bracket,
  bracketName,
}: TrendStripProps) => {
  const { t } = useTranslation();

  const { recent, results, trends } = useMemo(() => {
    const ordered = chronological(matches);
    const last = ordered.slice(-RECENT);
    const sparkWindow = ordered.slice(-(SPARK_MATCHES + SPARK_SMOOTHING - 1));
    return {
      recent: summarize(last),
      results: last.map((match) => ({ id: match.match_id, won: isWin(match) })),
      trends: TREND_METRICS.map(({ metric, format }) => ({
        metric,
        format,
        value: median(last.map(PER_MATCH[metric])),
        series: rollingMedian(
          sparkWindow.map(PER_MATCH[metric]),
          SPARK_SMOOTHING,
        ).slice(-SPARK_MATCHES),
      })),
    };
  }, [matches]);

  const medians = new Map(bracket.map((row) => [row.metric, row]));

  return (
    <Card className='stats-surface grid h-full grid-cols-1 overflow-hidden shadow-none sm:grid-cols-2 xl:grid-cols-[minmax(260px,1.3fr)_repeat(4,minmax(0,1fr))]'>
      <div className='flex items-center gap-4 p-5'>
        <div className='relative shrink-0'>
          <WinrateRing winrate={recent.winrate} />
          <div className='absolute inset-0 flex flex-col items-center justify-center'>
            <span className='font-bold text-xl leading-none tabular-nums'>
              {formatPercent(recent.winrate, 0)}
            </span>
            <span className='mt-1 font-mono text-[9.5px] text-muted-foreground'>
              {t("stats.form.recordValue", {
                wins: recent.wins,
                losses: recent.matches - recent.wins,
              })}
            </span>
          </div>
        </div>
        <div className='flex min-w-0 flex-1 flex-col gap-2'>
          <span className='font-semibold text-[10.5px] text-muted-foreground uppercase tracking-[0.12em]'>
            {t("stats.form.winrateLabel", { count: recent.matches })}
          </span>
          <div
            aria-label={t("stats.trends.resultsLabel", {
              wins: recent.wins,
              losses: recent.matches - recent.wins,
            })}
            className='flex h-[22px] items-end gap-[3px]'
            role='img'>
            {results.map((result) => (
              <span
                className={
                  result.won
                    ? "h-full flex-1 rounded-[3px]"
                    : "h-1/2 flex-1 rounded-[3px]"
                }
                key={result.id}
                style={{
                  backgroundColor: result.won
                    ? tint(WIN_COLOR, 80)
                    : tint(LOSS_COLOR, 70),
                }}
              />
            ))}
          </div>
          <span className='font-mono text-[10px] text-muted-foreground/70'>
            {t("stats.trends.oldestToLatest")}
          </span>
        </div>
      </div>

      {trends.map(({ metric, value, series, format }) => {
        const row = medians.get(metric);
        const diff = row ? value - row.median : null;
        const better =
          diff !== null && (row?.higherIsBetter ? diff > 0 : diff < 0);
        return (
          <div
            className='flex min-w-0 flex-col gap-1.5 border-border/70 border-t p-5 sm:border-l xl:border-t-0'
            key={metric}>
            <div className='flex items-center justify-between gap-2'>
              <span className='truncate font-semibold text-[10.5px] text-muted-foreground uppercase tracking-[0.12em]'>
                {t(`stats.bracket.metrics.${metric}`)}
              </span>
              {diff !== null && Math.abs(diff) > 0 && (
                <span
                  className='shrink-0 rounded-full px-1.5 py-px font-mono font-semibold text-[10.5px]'
                  style={{
                    color: better ? WIN_COLOR : LOSS_COLOR,
                    backgroundColor: tint(better ? WIN_COLOR : LOSS_COLOR, 12),
                  }}>
                  {diff > 0 ? "+" : "-"}
                  {format(Math.abs(diff))}
                </span>
              )}
            </div>
            <span className='font-bold text-2xl leading-none tracking-tight tabular-nums'>
              {format(value)}
            </span>
            <Sparkline reference={row?.median ?? null} values={series} />
            <span className='truncate font-mono text-[10px] text-muted-foreground/70'>
              {row
                ? t(
                    bracketName
                      ? "stats.trends.bracketMedian"
                      : "stats.trends.globalMedian",
                    { rank: bracketName, value: format(row.median) },
                  )
                : t("stats.trends.lastMatches", { count: series.length })}
            </span>
          </div>
        );
      })}
    </Card>
  );
};
