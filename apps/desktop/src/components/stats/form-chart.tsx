import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@deadlock-mods/ui/components/chart";
import { useMemo } from "react";
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
import type { MatchHistoryEntry } from "@/lib/stats/api";
import { rollingWinrate } from "@/lib/stats/derive";
import { formatDayTick, formatPercent } from "@/lib/stats/format";

const WINDOW = 20;

interface FormChartProps {
  matches: MatchHistoryEntry[];
}

export const FormChart = ({ matches }: FormChartProps) => {
  const { t, i18n } = useTranslation();

  const data = useMemo(
    () =>
      rollingWinrate(matches, WINDOW)
        .filter((point) => point.winrate !== null)
        .map((point) => ({
          startTime: point.startTime,
          winrate: (point.winrate as number) * 100,
        })),
    [matches],
  );

  const config = {
    winrate: {
      label: t("stats.charts.winrate"),
      color: "var(--viz-series-1)",
    },
  } satisfies ChartConfig;

  if (data.length === 0) {
    return null;
  }

  return (
    <ChartCard
      description={t("stats.charts.formDescription", { window: WINDOW })}
      title={t("stats.charts.formTitle")}>
      <ChartContainer className='aspect-auto h-[260px] w-full' config={config}>
        <AreaChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
          <defs>
            <linearGradient id='formFill' x1='0' x2='0' y1='0' y2='1'>
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
          <CartesianGrid stroke='hsl(var(--chart-grid))' vertical={false} />
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
            ticks={[0, 25, 50, 75, 100]}
            width={40}
          />
          {/* The only line that matters: even odds. */}
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
                    {formatPercent(Number(value) / 100)}
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
            fill='url(#formFill)'
            stroke='var(--color-winrate)'
            strokeWidth={2}
            type='monotone'
          />
        </AreaChart>
      </ChartContainer>
    </ChartCard>
  );
};
