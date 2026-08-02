import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@deadlock-mods/ui/components/chart";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "@/components/stats/chart-card";
import type { BenchmarkMetric } from "@/lib/stats/derive";
import { formatCompact, formatSignedPercent } from "@/lib/stats/format";

interface BenchmarkChartProps {
  heroName: string;
  metrics: BenchmarkMetric[];
}

/**
 * Diverging bars: how far the player sits from the global average on one hero.
 * The sign is not enough on its own - deaths above average is a bad thing - so
 * the colour follows "is this an improvement", and the label spells out both values.
 */
export const BenchmarkChart = ({ heroName, metrics }: BenchmarkChartProps) => {
  const { t } = useTranslation();

  const data = useMemo(
    () =>
      metrics.map((metric) => {
        const isGood =
          metric.deltaPct === 0
            ? true
            : metric.deltaPct > 0 === metric.higherIsBetter;
        return {
          metric: t(`stats.metrics.${metric.metric}`),
          // Extreme outliers would flatten every other bar.
          delta: Math.max(-100, Math.min(100, metric.deltaPct * 100)),
          rawDelta: metric.deltaPct,
          mine: metric.mine,
          global: metric.global,
          isGood,
        };
      }),
    [metrics, t],
  );

  const config = {
    delta: { label: t("stats.charts.benchmarkDelta") },
  } satisfies ChartConfig;

  if (data.length === 0) {
    return null;
  }

  return (
    <ChartCard
      description={t("stats.charts.benchmarkDescription", { hero: heroName })}
      title={t("stats.charts.benchmarkTitle")}>
      <ChartContainer className='aspect-auto h-[300px] w-full' config={config}>
        <BarChart
          data={data}
          layout='vertical'
          margin={{ left: 8, right: 48, top: 4, bottom: 4 }}>
          <XAxis
            axisLine={false}
            domain={[-100, 100]}
            tickFormatter={(value: number) => `${value}%`}
            tickLine={false}
            type='number'
          />
          <YAxis
            axisLine={false}
            dataKey='metric'
            tickLine={false}
            type='category'
            width={100}
          />
          <ReferenceLine stroke='hsl(var(--border))' x={0} />
          <ChartTooltip
            cursor={{ fill: "hsl(var(--accent))" }}
            content={
              <ChartTooltipContent
                hideIndicator
                formatter={(_value, _name, item) => (
                  <span className='font-medium'>
                    {t("stats.charts.benchmarkTooltip", {
                      mine: formatCompact(Number(item?.payload?.mine ?? 0)),
                      global: formatCompact(Number(item?.payload?.global ?? 0)),
                    })}
                  </span>
                )}
                labelFormatter={(_, payload) =>
                  String(payload?.[0]?.payload?.metric ?? "")
                }
              />
            }
          />
          <Bar dataKey='delta' maxBarSize={20} radius={4}>
            {data.map((entry) => (
              <Cell
                fill={
                  entry.isGood ? "var(--viz-positive)" : "var(--viz-negative)"
                }
                key={entry.metric}
              />
            ))}
            <LabelList
              className='fill-muted-foreground'
              dataKey='rawDelta'
              fontSize={11}
              formatter={(value: number) => formatSignedPercent(value, 0)}
              position='right'
            />
          </Bar>
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
};
