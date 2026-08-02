import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@deadlock-mods/ui/components/avatar";
import { Card } from "@deadlock-mods/ui/components/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@deadlock-mods/ui/components/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@deadlock-mods/ui/components/table";
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
import type { DeadlockItem } from "@/lib/deadlock-api";
import type { ItemInsight } from "@/lib/stats/derive";
import { formatPercent, formatSignedPercent } from "@/lib/stats/format";
import { cn } from "@/lib/utils";

/** Enough rows to see a pattern without turning into a wall of bars. */
const CHART_ITEMS = 10;

interface ItemsTabProps {
  items: ItemInsight[];
  itemsById: Map<number, DeadlockItem>;
  isPending: boolean;
}

const ItemIcon = ({ item }: { item: DeadlockItem | undefined }) => (
  <Avatar className='h-7 w-7 rounded-md'>
    {(item?.shop_image_webp ?? item?.shop_image) && (
      <AvatarImage
        alt=''
        className='object-contain'
        src={item?.shop_image_webp ?? item?.shop_image}
      />
    )}
    <AvatarFallback className='rounded-md text-xs'>?</AvatarFallback>
  </Avatar>
);

const formatMinutes = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;

const formatSignedMinutes = (seconds: number) =>
  `${seconds >= 0 ? "+" : "-"}${formatMinutes(Math.abs(seconds))}`;

export const ItemsTab = ({ items, itemsById, isPending }: ItemsTabProps) => {
  const { t } = useTranslation();

  const chartData = useMemo(
    () =>
      [...items]
        .sort((a, b) => b.matches - a.matches)
        .slice(0, CHART_ITEMS)
        .sort((a, b) => b.winrateDelta - a.winrateDelta)
        .map((item) => ({
          name: itemsById.get(item.itemId)?.name ?? `#${item.itemId}`,
          delta: item.winrateDelta * 100,
          rawDelta: item.winrateDelta,
          winrate: item.winrate,
          matches: item.matches,
        })),
    [items, itemsById],
  );

  const config = {
    delta: { label: t("stats.items.delta") },
  } satisfies ChartConfig;

  if (isPending) {
    return (
      <p className='py-10 text-center text-muted-foreground text-sm'>
        {t("stats.items.loading")}
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <p className='py-10 text-center text-muted-foreground text-sm'>
        {t("stats.items.empty")}
      </p>
    );
  }

  return (
    <div className='flex flex-col gap-4 pb-8'>
      <ChartCard
        description={t("stats.items.chartDescription")}
        title={t("stats.items.chartTitle")}>
        <ChartContainer
          className='aspect-auto w-full'
          config={config}
          style={{ height: `${Math.max(200, chartData.length * 34)}px` }}>
          <BarChart
            data={chartData}
            layout='vertical'
            margin={{ left: 8, right: 56, top: 4, bottom: 4 }}>
            <XAxis
              axisLine={false}
              tickFormatter={(value: number) => `${Math.round(value)}%`}
              tickLine={false}
              type='number'
            />
            <YAxis
              axisLine={false}
              dataKey='name'
              tickFormatter={(value: string) =>
                value.length > 20 ? `${value.slice(0, 19)}…` : value
              }
              tickLine={false}
              type='category'
              width={150}
            />
            <ReferenceLine stroke='hsl(var(--border))' x={0} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  hideIndicator
                  formatter={(_value, _name, item) => (
                    <span className='font-medium'>
                      {t("stats.items.tooltip", {
                        winrate: formatPercent(
                          Number(item?.payload?.winrate ?? 0),
                          0,
                        ),
                        matches: Number(item?.payload?.matches ?? 0),
                      })}
                    </span>
                  )}
                  labelFormatter={(_, payload) =>
                    String(payload?.[0]?.payload?.name ?? "")
                  }
                />
              }
              cursor={{ fill: "hsl(var(--accent))" }}
            />
            <Bar dataKey='delta' maxBarSize={20} radius={4}>
              {chartData.map((entry) => (
                <Cell
                  fill={
                    entry.delta >= 0
                      ? "var(--viz-positive)"
                      : "var(--viz-negative)"
                  }
                  key={entry.name}
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

      <Card className='shadow-none'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("stats.items.item")}</TableHead>
              <TableHead className='text-right'>
                {t("stats.items.matches")}
              </TableHead>
              <TableHead className='text-right'>
                {t("stats.items.winrate")}
              </TableHead>
              <TableHead className='text-right'>
                {t("stats.items.global")}
              </TableHead>
              <TableHead className='text-right'>
                {t("stats.items.delta")}
              </TableHead>
              <TableHead className='text-right'>
                {t("stats.items.buyTime")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const asset = itemsById.get(item.itemId);
              return (
                <TableRow key={item.itemId}>
                  <TableCell>
                    <div className='flex items-center gap-2'>
                      <ItemIcon item={asset} />
                      <div className='min-w-0'>
                        <div className='truncate font-medium'>
                          {asset?.name ?? `#${item.itemId}`}
                        </div>
                        {asset?.item_tier && (
                          <div className='text-muted-foreground text-xs'>
                            {t("stats.items.tier", { tier: asset.item_tier })}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {item.matches}
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {formatPercent(item.winrate, 0)}
                  </TableCell>
                  <TableCell className='text-right text-muted-foreground tabular-nums'>
                    {formatPercent(item.globalWinrate, 0)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      item.winrateDelta >= 0
                        ? "text-emerald-500"
                        : "text-destructive",
                    )}>
                    {formatSignedPercent(item.winrateDelta, 1)}
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {formatMinutes(item.avgBuyTimeS)}
                    {Math.abs(item.buyTimeDeltaS) >= 30 && (
                      <span
                        className={cn(
                          "ml-1 text-xs",
                          item.buyTimeDeltaS > 0
                            ? "text-amber-500"
                            : "text-muted-foreground",
                        )}>
                        {formatSignedMinutes(item.buyTimeDeltaS)}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};
