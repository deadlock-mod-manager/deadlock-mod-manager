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
  CartesianGrid,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "@/components/stats/chart-card";
import {
  PillLabel,
  LOSS_COLOR,
  tint,
  VerticalFade,
  WIN_COLOR,
} from "@/components/stats/chart-fx";
import type { DeadlockHero } from "@/lib/deadlock-api";
import type { MatchHistoryEntry } from "@/lib/stats/api";
import {
  chronological,
  isWin,
  rollingWinrate,
  summarize,
} from "@/lib/stats/derive";
import { formatPercent } from "@/lib/stats/format";

const DEFAULT_WINDOW = 20;
/** Matches on the plot: enough for a trend, few enough that each bead reads. */
const DEFAULT_SHOWN = 60;

interface FormChartProps {
  matches: MatchHistoryEntry[];
  heroesById: Map<number, DeadlockHero>;
  /** Matches in the rolling window; a short history wants a shorter one. */
  window?: number;
  shown?: number;
}

interface FormRow {
  index: number;
  /** Percent, `null` until the rolling window has filled. */
  winrate: number | null;
  won: boolean;
  heroId: number;
}

const EndDot = ({ cx, cy }: { cx: number; cy: number }) => (
  <g>
    <circle
      cx={cx}
      cy={cy}
      fill='var(--color-winrate)'
      fillOpacity={0.18}
      r={9}
    />
    <circle
      cx={cx}
      cy={cy}
      fill='var(--color-winrate)'
      r={4}
      stroke='hsl(var(--card))'
      strokeWidth={2}
    />
  </g>
);

/**
 * The trailing winrate as a curve, with every match it is made of underneath as
 * a bead. Losses are shorter beads, so the strip reads without colour too.
 */
export const FormChart = ({
  matches,
  heroesById,
  window = DEFAULT_WINDOW,
  shown = DEFAULT_SHOWN,
}: FormChartProps) => {
  const { t } = useTranslation();
  const fillId = useId();

  const { rows, baseline } = useMemo(() => {
    const ordered = chronological(matches);
    const rolling = rollingWinrate(ordered, window);
    const start = Math.max(0, ordered.length - shown);
    return {
      rows: ordered.slice(start).map((match, offset): FormRow => {
        const winrate = rolling[start + offset]?.winrate ?? null;
        return {
          index: offset,
          winrate: winrate === null ? null : winrate * 100,
          won: isWin(match),
          heroId: match.hero_id,
        };
      }),
      baseline: summarize(ordered).winrate * 100,
    };
  }, [matches, window, shown]);

  if (rows.length === 0) {
    return null;
  }

  const lastIndex = rows.length - 1;
  const hasCurve = rows.some((row) => row.winrate !== null);
  const config = {
    winrate: { label: t("stats.charts.winrate"), color: "hsl(var(--primary))" },
  } satisfies ChartConfig;

  return (
    <ChartCard
      description={t("stats.form.description", {
        window: window,
        count: rows.length,
      })}
      title={t("stats.charts.formTitle")}>
      <div className='flex h-full min-h-[220px] flex-col gap-2.5'>
        <div className='stats-dot-grid relative min-h-[140px] flex-1 rounded-md'>
          {hasCurve ? (
            <ChartContainer
              className='stats-chart absolute inset-0 aspect-auto h-full w-full'
              config={config}>
              <AreaChart data={rows} margin={{ left: 0, right: 0, top: 12 }}>
                <defs>
                  <VerticalFade color='var(--color-winrate)' id={fillId} />
                </defs>
                <CartesianGrid vertical={false} />
                {/* A band scale centres each point over its bead. */}
                <XAxis dataKey='index' hide scale='band' />
                <YAxis
                  axisLine={false}
                  domain={[
                    (min: number) => Math.max(0, Math.floor(min / 10) * 10 - 5),
                    (max: number) =>
                      Math.min(100, Math.ceil(max / 10) * 10 + 5),
                  ]}
                  orientation='right'
                  tickFormatter={(value: number) => `${value}%`}
                  tickLine={false}
                  width={40}
                />
                <ReferenceLine
                  label={
                    <PillLabel
                      text={t("stats.form.baseline", {
                        value: formatPercent(baseline / 100, 0),
                      })}
                    />
                  }
                  stroke='hsl(var(--primary))'
                  strokeDasharray='5 4'
                  strokeOpacity={0.4}
                  y={baseline}
                />
                <ChartTooltip
                  content={({ active, payload }) => {
                    const row: FormRow | undefined = payload?.[0]?.payload;
                    if (!active || !row || row.winrate === null) return null;
                    return (
                      <div className='rounded-lg border border-border/60 bg-popover px-2.5 py-1.5 text-xs shadow-lg'>
                        <div className='font-medium'>
                          {heroesById.get(row.heroId)?.name ?? `#${row.heroId}`}
                          <span
                            className='ml-2'
                            style={{ color: row.won ? WIN_COLOR : LOSS_COLOR }}>
                            {row.won ? t("stats.win") : t("stats.loss")}
                          </span>
                        </div>
                        <div className='font-mono text-muted-foreground'>
                          {t("stats.form.tooltip", {
                            winrate: formatPercent(row.winrate / 100, 0),
                            window: window,
                          })}
                        </div>
                      </div>
                    );
                  }}
                  cursor={{
                    stroke: "hsl(var(--primary))",
                    strokeOpacity: 0.25,
                  }}
                />
                <Area
                  activeDot={{
                    r: 4,
                    fill: "hsl(var(--card))",
                    stroke: "var(--color-winrate)",
                    strokeWidth: 2,
                  }}
                  dataKey='winrate'
                  dot={({ cx, cy, index }) =>
                    index === lastIndex &&
                    cx !== undefined &&
                    cy !== undefined ? (
                      <EndDot cx={cx} cy={cy} key='end' />
                    ) : (
                      <g key={index} />
                    )
                  }
                  fill={`url(#${fillId})`}
                  isAnimationActive={false}
                  stroke='var(--color-winrate)'
                  strokeWidth={2}
                  // The rolling winrate moves in 5% steps; a spline reads the
                  // trend instead of drawing every step as a spike.
                  type='basis'
                />
              </AreaChart>
            </ChartContainer>
          ) : (
            <p className='flex h-full items-center justify-center text-muted-foreground text-sm'>
              {t("stats.form.tooFew", { window: window })}
            </p>
          )}
        </div>

        <div aria-hidden className='flex h-3 items-end gap-[3px] pr-10'>
          {rows.map((row) => (
            <span
              className={
                row.won
                  ? "h-3 flex-1 rounded-[2px]"
                  : "h-2 flex-1 rounded-[2px]"
              }
              key={row.index}
              style={{
                backgroundColor: row.won
                  ? tint(WIN_COLOR, 75)
                  : tint(LOSS_COLOR, 65),
              }}
            />
          ))}
        </div>
        <div className='flex items-center justify-between pr-10 font-mono text-[10.5px] text-muted-foreground/70'>
          <span>{t("stats.form.oldest", { count: rows.length })}</span>
          <span className='flex items-center gap-3 font-sans text-muted-foreground'>
            <span className='flex items-center gap-1.5'>
              <span
                className='h-3 w-2 rounded-[2px]'
                style={{ backgroundColor: WIN_COLOR }}
              />
              {t("stats.win")}
            </span>
            <span className='flex items-center gap-1.5'>
              <span
                className='h-2 w-2 rounded-[2px]'
                style={{ backgroundColor: LOSS_COLOR }}
              />
              {t("stats.loss")}
            </span>
          </span>
          <span>{t("stats.form.latest")}</span>
        </div>
      </div>
    </ChartCard>
  );
};
