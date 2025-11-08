"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@deadlock-mods/ui/components/chart";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { orpc } from "@/utils/orpc";

type DashboardChartProps = {
  title: string;
  description: string;
  dataKey: "mods" | "downloads" | "users" | "modFiles";
  color: string;
  timeRange: "1h" | "1d" | "7d" | "30d" | "90d" | "all";
};

export function DashboardChart({
  title,
  description,
  dataKey,
  color,
  timeRange,
}: DashboardChartProps) {
  const queryOptions = useMemo(
    () => orpc.getAnalytics.queryOptions({ timeRange }),
    [timeRange],
  );
  const analyticsQuery = useQuery(queryOptions);
  const analyticsResponse = analyticsQuery.data;
  const data = useMemo(
    () => analyticsResponse?.data || [],
    [analyticsResponse?.data],
  );

  if (analyticsQuery.isLoading) {
    return (
      <Card className='@container/card'>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex h-[250px] items-center justify-center text-muted-foreground'>
            Loading...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data.length) {
    return (
      <Card className='@container/card'>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex h-[250px] items-center justify-center text-muted-foreground'>
            No data available
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartConfig: ChartConfig = {
    [dataKey]: {
      label: title,
      color,
    },
  };

  return (
    <Card className='@container/card'>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className='px-2 pt-4 sm:px-6 sm:pt-6'>
        <ChartContainer
          config={chartConfig}
          className='aspect-auto h-[250px] w-full'
          key={`chart-${timeRange}-${dataKey}`}>
          <AreaChart data={data} key={`area-chart-${timeRange}-${dataKey}`}>
            <defs>
              <linearGradient
                id={`fill-${timeRange}-${dataKey}`}
                x1='0'
                y1='0'
                x2='0'
                y2='1'>
                <stop offset='5%' stopColor={color} stopOpacity={1.0} />
                <stop offset='95%' stopColor={color} stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey='date'
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value: string) => {
                const date = new Date(value);
                if (timeRange === "1h") {
                  return date.toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  });
                }
                return date.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                });
              }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              domain={[0, "auto"]}
              tickFormatter={(value: number) => {
                if (value >= 1000) {
                  return `${(value / 1000).toFixed(1)}K`;
                }
                return value.toString();
              }}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => {
                    const date = new Date(value);
                    if (timeRange === "1h") {
                      return date.toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      });
                    }
                    return date.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    });
                  }}
                  indicator='dot'
                />
              }
            />
            <Area
              dataKey={dataKey}
              type='natural'
              fill={`url(#fill-${timeRange}-${dataKey})`}
              stroke={color}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
