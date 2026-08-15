import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@deadlock-mods/ui/components/chart";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import type { FormPoint } from "@/lib/stats/derive";
import { formatDayTick, formatPercent } from "@/lib/stats/format";

interface WinrateAreaChartProps {
  data: FormPoint[];
  heightPx: number;
}

/**
 * A rolling winrate over time. Only the plot - the caller brings its own frame,
 * because the page shows it in a chart card and the player dialog in a plain
 * section. Both used to carry their own copy of this recharts setup.
 */
export const WinrateAreaChart = ({ data, heightPx }: WinrateAreaChartProps) => {
  const { t, i18n } = useTranslation();
  // Gradient ids are document-global, so two instances on one screen would
  // otherwise share (and fight over) the same fill.
  const fillId = useId();

  const config = {
    winrate: {
      label: t("stats.charts.winrate"),
      color: "var(--viz-series-1)",
    },
  } satisfies ChartConfig;

  return (
    <ChartContainer
      className='aspect-auto w-full'
      config={config}
      style={{ height: `${heightPx}px` }}>
      <AreaChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
        <defs>
          <linearGradient id={fillId} x1='0' x2='0' y1='0' y2='1'>
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
          tickFormatter={(value: number) => formatDayTick(value, i18n.language)}
          tickLine={false}
          type='number'
        />
        <YAxis
          axisLine={false}
          domain={[0, 100]}
          tickFormatter={(value: number) => `${value}%`}
          tickLine={false}
          ticks={[0, 50, 100]}
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
          fill={`url(#${fillId})`}
          stroke='var(--color-winrate)'
          strokeWidth={2}
          type='monotone'
        />
      </AreaChart>
    </ChartContainer>
  );
};
