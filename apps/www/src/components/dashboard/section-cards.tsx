"use client";

import { Badge } from "@deadlock-mods/ui/components/badge";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import { TrendingDown, TrendingUp } from "lucide-react";

type AnalyticsDataPoint = {
  date: string;
  mods: number;
  downloads: number;
  users: number;
  modFiles: number;
};

type SectionCardProps = {
  title: string;
  value: number;
  trend: number;
  trendLabel: string;
  description: string;
};

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}

function getTrendPeriodDays(
  timeRange: "1h" | "1d" | "7d" | "30d" | "90d",
): number {
  switch (timeRange) {
    case "1h":
      return 0.5 / 24;
    case "1d":
      return 0.5;
    case "7d":
      return 3.5;
    case "30d":
      return 7;
    case "90d":
      return 7;
    default:
      return 7;
  }
}

function calculateTrend(
  data: AnalyticsDataPoint[],
  dataKey: keyof AnalyticsDataPoint,
  timeRange: "1h" | "1d" | "7d" | "30d" | "90d",
): { trend: number; current: number; previous: number } {
  if (!data.length) {
    return { trend: 0, current: 0, previous: 0 };
  }

  const periodDays = getTrendPeriodDays(timeRange);
  const now = new Date();
  const currentPeriodStart = new Date(now);
  currentPeriodStart.setDate(currentPeriodStart.getDate() - periodDays);
  currentPeriodStart.setHours(0, 0, 0, 0);

  const previousPeriodStart = new Date(currentPeriodStart);
  previousPeriodStart.setDate(previousPeriodStart.getDate() - periodDays);

  const currentPeriodData = data.filter((item) => {
    const itemDate = new Date(item.date);
    itemDate.setHours(0, 0, 0, 0);
    return itemDate >= currentPeriodStart && itemDate <= now;
  });

  const previousPeriodData = data.filter((item) => {
    const itemDate = new Date(item.date);
    itemDate.setHours(0, 0, 0, 0);
    return itemDate >= previousPeriodStart && itemDate < currentPeriodStart;
  });

  const current = currentPeriodData.reduce(
    (sum, item) => sum + (Number(item[dataKey]) || 0),
    0,
  );
  const previous = previousPeriodData.reduce(
    (sum, item) => sum + (Number(item[dataKey]) || 0),
    0,
  );

  const trend =
    previous === 0
      ? current > 0
        ? 100
        : 0
      : ((current - previous) / previous) * 100;

  return { trend, current, previous };
}

export function SectionCard({
  title,
  value,
  trend,
  trendLabel,
  description,
}: SectionCardProps) {
  const isPositive = trend >= 0;
  const TrendIcon = isPositive ? TrendingUp : TrendingDown;

  return (
    <Card className='@container/card'>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className='text-2xl font-semibold tabular-nums @[250px]/card:text-3xl'>
          {formatNumber(value)}
        </CardTitle>
        <CardAction>
          <Badge variant='outline'>
            <TrendIcon className='size-3' />
            {isPositive ? "+" : ""}
            {trend.toFixed(1)}%
          </Badge>
        </CardAction>
      </CardHeader>
      <CardFooter className='flex-col items-start gap-1.5 text-sm'>
        <div className='line-clamp-1 flex gap-2 font-medium'>
          {trendLabel}
          <TrendIcon className='size-4' />
        </div>
        <div className='text-muted-foreground'>{description}</div>
      </CardFooter>
    </Card>
  );
}

type SectionCardsProps = {
  data: AnalyticsDataPoint[];
  timeRange: "1h" | "1d" | "7d" | "30d" | "90d" | "all";
  totals?: {
    mods: number;
    downloads: number;
    users: number;
    modFiles: number;
  };
};

export function SectionCards({ data, timeRange, totals }: SectionCardsProps) {
  const modsTrend =
    timeRange === "all"
      ? { trend: 0, current: 0, previous: 0 }
      : calculateTrend(data, "mods", timeRange);
  const downloadsTrend =
    timeRange === "all"
      ? { trend: 0, current: 0, previous: 0 }
      : calculateTrend(data, "downloads", timeRange);
  const usersTrend =
    timeRange === "all"
      ? { trend: 0, current: 0, previous: 0 }
      : calculateTrend(data, "users", timeRange);
  const modFilesTrend =
    timeRange === "all"
      ? { trend: 0, current: 0, previous: 0 }
      : calculateTrend(data, "modFiles", timeRange);

  const totalMods = totals?.mods ?? 0;
  const totalDownloads = totals?.downloads ?? 0;
  const totalModFiles = totals?.modFiles ?? 0;
  const totalUsers = totals?.users ?? 0;

  const trendLabelPrefix =
    timeRange === "all"
      ? ""
      : timeRange === "1h"
        ? "vs previous 30 minutes"
        : timeRange === "1d"
          ? "vs previous 12 hours"
          : timeRange === "7d"
            ? "vs previous 3.5 days"
            : "vs previous week";

  return (
    <div className='*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-flow-col gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs  auto-cols-fr'>
      <SectionCard
        title='Total Mods'
        value={totalMods}
        trend={modsTrend.trend}
        trendLabel={
          timeRange === "all"
            ? "All time"
            : modsTrend.trend >= 0
              ? `Up ${modsTrend.trend.toFixed(1)}% ${trendLabelPrefix}`
              : `Down ${Math.abs(modsTrend.trend).toFixed(1)}% ${trendLabelPrefix}`
        }
        description={
          timeRange === "all"
            ? "Total mods in the platform"
            : "Mods created in the selected time period"
        }
      />
      <SectionCard
        title='Mod Downloads'
        value={totalDownloads}
        trend={downloadsTrend.trend}
        trendLabel={
          timeRange === "all"
            ? "All time"
            : downloadsTrend.trend >= 0
              ? `Up ${downloadsTrend.trend.toFixed(1)}% ${trendLabelPrefix}`
              : `Down ${Math.abs(downloadsTrend.trend).toFixed(1)}% ${trendLabelPrefix}`
        }
        description={
          timeRange === "all"
            ? "Total mod downloads"
            : "Mod downloads in the selected time period"
        }
      />
      <SectionCard
        title='Users'
        value={totalUsers}
        trend={usersTrend.trend}
        trendLabel={
          timeRange === "all"
            ? "All time"
            : usersTrend.trend >= 0
              ? `Up ${usersTrend.trend.toFixed(1)}% ${trendLabelPrefix}`
              : `Down ${Math.abs(usersTrend.trend).toFixed(1)}% ${trendLabelPrefix}`
        }
        description={
          timeRange === "all"
            ? "Total users"
            : "New users in the selected time period"
        }
      />
      <SectionCard
        title='Mod Files'
        value={totalModFiles}
        trend={modFilesTrend.trend}
        trendLabel={
          timeRange === "all"
            ? "All time"
            : modFilesTrend.trend >= 0
              ? `Up ${modFilesTrend.trend.toFixed(1)}% ${trendLabelPrefix}`
              : `Down ${Math.abs(modFilesTrend.trend).toFixed(1)}% ${trendLabelPrefix}`
        }
        description={
          timeRange === "all"
            ? "Total mod files"
            : "Mod files added in the selected time period"
        }
      />
    </div>
  );
}
