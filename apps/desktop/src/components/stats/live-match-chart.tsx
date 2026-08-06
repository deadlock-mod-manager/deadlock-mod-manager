import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@deadlock-mods/ui/components/chart";
import { useTranslation } from "react-i18next";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard, LegendKey } from "@/components/stats/chart-card";
import { formatClock, formatCompact } from "@/lib/stats/format";
import type { LiveMatchSample } from "@/lib/stats/live";

interface LiveMatchChartsProps {
  samples: LiveMatchSample[];
}

/**
 * Derived from the broadcast stream that is already open, so the match charts
 * cost nothing on top of the live scoreboard.
 */
export const LiveMatchCharts = ({ samples }: LiveMatchChartsProps) => {
  const { t } = useTranslation();

  const leadConfig = {
    soulLead: {
      label: t("stats.live.soulLead"),
      color: "var(--viz-series-1)",
    },
  } satisfies ChartConfig;

  const killConfig = {
    sapphireKills: {
      label: t("stats.live.sapphire"),
      color: "var(--viz-series-1)",
    },
    amberKills: { label: t("stats.live.amber"), color: "var(--viz-series-2)" },
  } satisfies ChartConfig;

  // Two points is the minimum that makes a line mean anything.
  if (samples.length < 2) {
    return null;
  }

  return (
    <div className='grid gap-4 lg:grid-cols-2'>
      <ChartCard
        description={t("stats.live.soulLeadDescription")}
        title={t("stats.live.soulLeadTitle")}>
        <ChartContainer
          className='aspect-auto h-[220px] w-full'
          config={leadConfig}>
          <AreaChart data={samples} margin={{ left: 4, right: 12, top: 8 }}>
            <defs>
              <linearGradient id='soulLeadFill' x1='0' x2='0' y1='0' y2='1'>
                <stop
                  offset='0%'
                  stopColor='var(--color-soulLead)'
                  stopOpacity={0.18}
                />
                <stop
                  offset='100%'
                  stopColor='var(--color-soulLead)'
                  stopOpacity={0.02}
                />
              </linearGradient>
            </defs>
            <CartesianGrid stroke='hsl(var(--chart-grid))' vertical={false} />
            <XAxis
              axisLine={false}
              dataKey='second'
              // Anchored at kick-off rather than at the first sample: the app
              // only records from the moment it connected, and a line that
              // starts partway across says so where a rescaled axis would hide
              // it behind a plausible-looking 16:41.
              domain={[0, "dataMax"]}
              minTickGap={40}
              tickFormatter={formatClock}
              tickLine={false}
              type='number'
            />
            <YAxis
              axisLine={false}
              tickFormatter={(value: number) => formatCompact(value)}
              tickLine={false}
              width={52}
            />
            <ReferenceLine stroke='hsl(var(--muted-foreground))' y={0} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => (
                    <span className='font-medium'>
                      {formatCompact(Number(value))}
                    </span>
                  )}
                  labelFormatter={(_, payload) =>
                    formatClock(Number(payload?.[0]?.payload?.second ?? 0))
                  }
                />
              }
            />
            <Area
              dataKey='soulLead'
              dot={false}
              fill='url(#soulLeadFill)'
              stroke='var(--color-soulLead)'
              strokeWidth={2}
              type='monotone'
            />
          </AreaChart>
        </ChartContainer>
      </ChartCard>

      <ChartCard
        action={
          <div className='flex gap-3'>
            <LegendKey
              color='var(--viz-series-1)'
              label={t("stats.live.sapphire")}
            />
            <LegendKey
              color='var(--viz-series-2)'
              label={t("stats.live.amber")}
            />
          </div>
        }
        description={t("stats.live.killsDescription")}
        title={t("stats.live.killsTitle")}>
        <ChartContainer
          className='aspect-auto h-[220px] w-full'
          config={killConfig}>
          <LineChart data={samples} margin={{ left: 4, right: 12, top: 8 }}>
            <CartesianGrid stroke='hsl(var(--chart-grid))' vertical={false} />
            <XAxis
              axisLine={false}
              dataKey='second'
              // Anchored at kick-off rather than at the first sample: the app
              // only records from the moment it connected, and a line that
              // starts partway across says so where a rescaled axis would hide
              // it behind a plausible-looking 16:41.
              domain={[0, "dataMax"]}
              minTickGap={40}
              tickFormatter={formatClock}
              tickLine={false}
              type='number'
            />
            <YAxis axisLine={false} tickLine={false} width={32} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) =>
                    formatClock(Number(payload?.[0]?.payload?.second ?? 0))
                  }
                />
              }
            />
            <Line
              dataKey='sapphireKills'
              dot={false}
              stroke='var(--color-sapphireKills)'
              strokeWidth={2}
              type='monotone'
            />
            <Line
              dataKey='amberKills'
              dot={false}
              stroke='var(--color-amberKills)'
              strokeWidth={2}
              type='monotone'
            />
          </LineChart>
        </ChartContainer>
      </ChartCard>
    </div>
  );
};
