import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@deadlock-mods/ui/components/avatar";
import { Card } from "@deadlock-mods/ui/components/card";
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
import { ChartCard } from "@/components/stats/chart-card";
import { DeltaBarChart } from "@/components/stats/delta-bar-chart";
import type { DeadlockItem } from "@/lib/deadlock-api";
import type { ItemInsight } from "@/lib/stats/derive";
import {
  formatClock,
  formatPercent,
  formatSignedPercent,
} from "@/lib/stats/format";
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

const formatSignedMinutes = (seconds: number) =>
  `${seconds >= 0 ? "+" : "-"}${formatClock(Math.abs(seconds))}`;

export const ItemsTab = ({ items, itemsById, isPending }: ItemsTabProps) => {
  const { t } = useTranslation();

  const bars = useMemo(
    () =>
      [...items]
        .sort((a, b) => b.matches - a.matches)
        .slice(0, CHART_ITEMS)
        .sort((a, b) => b.winrateDelta - a.winrateDelta)
        .map((item) => ({
          id: item.itemId,
          label: itemsById.get(item.itemId)?.name ?? `#${item.itemId}`,
          delta: item.winrateDelta * 100,
          rawDelta: item.winrateDelta,
          isPositive: item.winrateDelta >= 0,
          tooltip: t("stats.items.tooltip", {
            winrate: formatPercent(item.winrate, 0),
            matches: item.matches,
          }),
        })),
    [items, itemsById, t],
  );

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
        <DeltaBarChart
          bars={bars}
          maxLabelChars={20}
          seriesLabel={t("stats.items.delta")}
        />
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
                    {formatClock(item.avgBuyTimeS)}
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
