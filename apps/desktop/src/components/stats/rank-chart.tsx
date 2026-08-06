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
import type { MatchHistoryEntry, RankAsset } from "@/lib/stats/api";
import { resolveRank } from "@/lib/stats/api";
import { formatDayTick } from "@/lib/stats/format";

interface RankChartProps {
  matches: MatchHistoryEntry[];
  rankAssets: RankAsset[];
}

/**
 * Rank over time, straight off the match history: `ranked_display_badge` is what
 * Valve showed the player after each ranked match. This used to read
 * `/mmr-history`, which deadlock-api deprecated once Valve's MMR estimate went
 * away - the badge is the real number now, and it comes for free with a request
 * the page already makes.
 */
export const RankChart = ({ matches, rankAssets }: RankChartProps) => {
  const { t, i18n } = useTranslation();

  const data = useMemo(
    () =>
      matches
        // Unranked matches and placements carry no badge; plotting them as 0
        // would drop the line to Obscurus between every ranked game.
        .filter((match) => (match.ranked_display_badge ?? 0) > 0)
        .sort((a, b) => a.start_time - b.start_time)
        .map((match) => ({
          startTime: match.start_time,
          badge: match.ranked_display_badge as number,
        })),
    [matches],
  );

  const config = {
    badge: {
      label: t("stats.charts.rank"),
      color: "var(--viz-series-2)",
    },
  } satisfies ChartConfig;

  // Valve packs tier and subrank into one number, so the raw value is not a
  // scale anybody can read - every tick goes through the rank assets.
  const badgeLabel = (badge: number) => {
    const resolved = resolveRank(badge, rankAssets);
    if (!resolved.name) {
      return String(badge);
    }
    return resolved.subrank > 0
      ? `${resolved.name} ${resolved.subrank}`
      : resolved.name;
  };

  if (data.length < 2) {
    return (
      <ChartCard
        description={t("stats.charts.rankDescription")}
        title={t("stats.charts.rankTitle")}>
        <p className='py-10 text-center text-muted-foreground text-sm'>
          {t("stats.charts.rankEmpty")}
        </p>
      </ChartCard>
    );
  }

  return (
    <ChartCard
      description={t("stats.charts.rankDescription")}
      title={t("stats.charts.rankTitle")}>
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
            tickFormatter={badgeLabel}
            tickLine={false}
            width={96}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value) => (
                  <span className='font-medium'>
                    {badgeLabel(Number(value))}
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
          {/* Stepped: a badge holds until a match actually moves it, and a
              smoothed curve would invent ranks the player never had. */}
          <Line
            dataKey='badge'
            dot={false}
            stroke='var(--color-badge)'
            strokeWidth={2}
            type='stepAfter'
          />
        </LineChart>
      </ChartContainer>
    </ChartCard>
  );
};
