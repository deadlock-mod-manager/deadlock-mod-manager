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
  CartesianGrid,
  LabelList,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "@/components/stats/chart-card";
import type { MatchHistoryEntry } from "@/lib/stats/api";
import { sessionCurve, summarize } from "@/lib/stats/derive";
import { formatPercent } from "@/lib/stats/format";

interface SessionChartProps {
  matches: MatchHistoryEntry[];
}

/**
 * Winrate by position within a play session. The shape of this one answers "when
 * should I stop for today" better than any average can.
 */
export const SessionChart = ({ matches }: SessionChartProps) => {
  const { t } = useTranslation();

  const { data, baseline } = useMemo(() => {
    const curve = sessionCurve(matches);
    return {
      data: curve.map((slot) => ({
        position: slot.bucket,
        winrate: slot.winrate * 100,
        matches: slot.matches,
      })),
      baseline: summarize(matches).winrate * 100,
    };
  }, [matches]);

  const config = {
    winrate: {
      label: t("stats.charts.winrate"),
      color: "var(--viz-series-1)",
    },
  } satisfies ChartConfig;

  if (data.length < 2) {
    return null;
  }

  return (
    <ChartCard
      description={t("stats.charts.sessionDescription")}
      title={t("stats.charts.sessionTitle")}>
      <ChartContainer className='aspect-auto h-[220px] w-full' config={config}>
        <BarChart data={data} margin={{ left: 4, right: 12, top: 16 }}>
          <CartesianGrid stroke='hsl(var(--chart-grid))' vertical={false} />
          <XAxis
            axisLine={false}
            dataKey='position'
            tickFormatter={(value: number) =>
              t("stats.charts.sessionTick", { position: value })
            }
            tickLine={false}
          />
          <YAxis
            axisLine={false}
            domain={[0, 100]}
            tickFormatter={(value: number) => `${value}%`}
            tickLine={false}
            ticks={[0, 25, 50, 75, 100]}
            width={40}
          />
          <ReferenceLine
            stroke='hsl(var(--muted-foreground))'
            strokeDasharray='4 4'
            y={baseline}
          />
          <ChartTooltip
            cursor={{ fill: "hsl(var(--accent))" }}
            content={
              <ChartTooltipContent
                formatter={(value, _name, item) => (
                  <span className='font-medium'>
                    {formatPercent(Number(value) / 100)}
                    <span className='ml-1 font-normal text-muted-foreground'>
                      {t("stats.charts.matchCount", {
                        count: Number(item?.payload?.matches ?? 0),
                      })}
                    </span>
                  </span>
                )}
                labelFormatter={(_, payload) =>
                  t("stats.charts.sessionTooltip", {
                    position: Number(payload?.[0]?.payload?.position ?? 0),
                  })
                }
              />
            }
          />
          <Bar
            dataKey='winrate'
            fill='var(--color-winrate)'
            maxBarSize={24}
            radius={[4, 4, 0, 0]}>
            <LabelList
              className='fill-muted-foreground'
              dataKey='winrate'
              fontSize={11}
              formatter={(value: number) => `${Math.round(value)}%`}
              position='top'
            />
          </Bar>
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
};
