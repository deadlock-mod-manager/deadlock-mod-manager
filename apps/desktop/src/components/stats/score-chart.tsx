import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@deadlock-mods/ui/components/chart";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartCard } from "@/components/stats/chart-card";
import type { MmrHistoryEntry } from "@/lib/stats/api";
import { formatDayTick, formatDecimal } from "@/lib/stats/format";

interface ScoreChartProps {
  history: MmrHistoryEntry[];
}

/**
 * Player score over time. Deliberately its own card rather than a second axis on
 * the form chart - two scales in one plot invite false correlations.
 */
export const ScoreChart = ({ history }: ScoreChartProps) => {
  const { t, i18n } = useTranslation();

  const data = useMemo(
    () =>
      history
        // Unranked matches report a score of 0, which would drag the line to the floor.
        .filter((entry) => entry.player_score > 0)
        .sort((a, b) => a.start_time - b.start_time)
        .map((entry) => ({
          startTime: entry.start_time,
          score: entry.player_score,
        })),
    [history],
  );

  const config = {
    score: {
      label: t("stats.charts.playerScore"),
      color: "var(--viz-series-2)",
    },
  } satisfies ChartConfig;

  if (data.length < 2) {
    return (
      <ChartCard
        description={t("stats.charts.scoreDescription")}
        title={t("stats.charts.scoreTitle")}>
        <p className='py-10 text-center text-muted-foreground text-sm'>
          {t("stats.charts.scoreEmpty")}
        </p>
      </ChartCard>
    );
  }

  return (
    <ChartCard
      description={t("stats.charts.scoreDescription")}
      title={t("stats.charts.scoreTitle")}>
      <ChartContainer className='aspect-auto h-[220px] w-full' config={config}>
        <LineChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
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
            domain={["dataMin - 1", "dataMax + 1"]}
            tickFormatter={(value: number) => formatDecimal(value, 0)}
            tickLine={false}
            width={40}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value) => (
                  <span className='font-medium'>
                    {formatDecimal(Number(value))}
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
          <Line
            dataKey='score'
            dot={false}
            stroke='var(--color-score)'
            strokeWidth={2}
            type='monotone'
          />
        </LineChart>
      </ChartContainer>
    </ChartCard>
  );
};
