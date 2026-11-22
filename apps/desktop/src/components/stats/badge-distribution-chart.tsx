import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@deadlock-mods/ui/components/chart";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, Cell, XAxis, YAxis } from "recharts";
import type { BadgeDistributionEntry, RankAsset } from "@/lib/stats/api";
import { resolveRank } from "@/lib/stats/api";
import { formatCompact, formatPercent } from "@/lib/stats/format";
import { badgeHistogram } from "@/lib/stats/rank";

/** Rank artwork as the axis: eleven tier names would never fit side by side. */
const BadgeTick = ({
  x,
  y,
  payload,
  imagesByTier,
}: {
  x?: number;
  y?: number;
  payload?: { value?: number };
  imagesByTier: Map<number, string>;
}) => {
  const tier = Number(payload?.value ?? 0);
  const image = imagesByTier.get(tier);
  if (!image || x === undefined || y === undefined) {
    return (
      <text
        className='fill-muted-foreground text-[10px]'
        textAnchor='middle'
        x={x}
        y={(y ?? 0) + 12}>
        {tier}
      </text>
    );
  }
  return <image height={22} href={image} width={22} x={x - 11} y={y + 2} />;
};

interface BadgeDistributionChartProps {
  distribution: BadgeDistributionEntry[];
  rankAssets: RankAsset[];
  /** The player's badge, whose tier gets called out. */
  ownBadge: number;
}

/**
 * Where every ranked player sits, one bar per tier. A histogram rather than a
 * percentile number alone, because the shape is the point: the ladder is not
 * evenly populated, and "top 20%" means something different at each end of it.
 */
export const BadgeDistributionChart = ({
  distribution,
  rankAssets,
  ownBadge,
}: BadgeDistributionChartProps) => {
  const { t } = useTranslation();

  const data = useMemo(
    () => badgeHistogram(distribution, ownBadge),
    [distribution, ownBadge],
  );
  const total = useMemo(
    () => data.reduce((sum, bucket) => sum + bucket.players, 0),
    [data],
  );
  const imagesByTier = useMemo(() => {
    const map = new Map<number, string>();
    for (const asset of rankAssets) {
      const image = asset.images.large ?? asset.images.small;
      if (image) {
        map.set(asset.tier, image);
      }
    }
    return map;
  }, [rankAssets]);

  const config = {
    players: { label: t("stats.rank.players") },
  } satisfies ChartConfig;

  if (data.length === 0) {
    return null;
  }

  return (
    <ChartContainer className='aspect-auto h-[180px] w-full' config={config}>
      <BarChart data={data} margin={{ left: 4, right: 4, top: 8, bottom: 8 }}>
        <XAxis
          axisLine={false}
          dataKey='tier'
          interval={0}
          tick={<BadgeTick imagesByTier={imagesByTier} />}
          tickLine={false}
        />
        <YAxis
          axisLine={false}
          tickFormatter={(value: number) => formatCompact(value)}
          tickLine={false}
          width={40}
        />
        <ChartTooltip
          cursor={{ fill: "hsl(var(--accent))" }}
          content={
            <ChartTooltipContent
              hideIndicator
              formatter={(value) => (
                <span className='font-medium tabular-nums'>
                  {formatCompact(Number(value))}
                  <span className='ml-1 font-normal text-muted-foreground'>
                    {total > 0 && formatPercent(Number(value) / total, 1)}
                  </span>
                </span>
              )}
              labelFormatter={(_, payload) => {
                const badge = Number(payload?.[0]?.payload?.badge ?? 0);
                return resolveRank(badge, rankAssets).name ?? String(badge);
              }}
            />
          }
        />
        <Bar dataKey='players' maxBarSize={40} radius={[4, 4, 0, 0]}>
          {data.map((bucket) => (
            <Cell
              fill={
                bucket.isOwn ? "var(--viz-series-2)" : "var(--viz-series-1)"
              }
              key={bucket.tier}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
};
