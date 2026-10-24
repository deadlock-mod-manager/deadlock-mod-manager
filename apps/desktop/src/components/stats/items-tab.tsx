import { Button } from "@deadlock-mods/ui/components/button";
import { Card } from "@deadlock-mods/ui/components/card";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@deadlock-mods/ui/components/toggle-group";
import { TrendingDown, TrendingUp, Zap } from "@deadlock-mods/ui/icons";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { LOSS_COLOR, tint, WIN_COLOR } from "@/components/stats/chart-fx";
import { ItemTile, slotColor } from "@/components/stats/match/item-tile";
import { PATRON_URL } from "@/components/stats/patron-hint";
import type { DeadlockItem } from "@/lib/deadlock-api";
import type { ItemInsight } from "@/lib/stats/derive";
import { formatClock, formatPercent } from "@/lib/stats/format";
import {
  isSlotType,
  SLOT_TYPES,
  type SlotType,
} from "@/lib/stats/match-analysis";
import { cn } from "@/lib/utils";

type SlotFilter = SlotType | "all";

const isSlotFilter = (value: string): value is SlotFilter =>
  value === "all" || isSlotType(value);

/** The ruler spans this winrate range; items outside it pin to the edge. */
const RULER_LOW = 0.3;
const RULER_HIGH = 0.8;
/** A buy time gap below this is noise, not "late". */
const LATE_BUY_S = 90;

const at = (winrate: number) =>
  `${Math.min(1, Math.max(0, (winrate - RULER_LOW) / (RULER_HIGH - RULER_LOW))) * 100}%`;

const signedPoints = (delta: number) => {
  const points = Math.round(delta * 100);
  return `${points > 0 ? "+" : ""}${points}`;
};

const Ruler = ({ item }: { item: ItemInsight }) => {
  const good = item.winrateDelta >= 0;
  const color = good ? WIN_COLOR : LOSS_COLOR;
  const [from, to] =
    item.winrate >= item.globalWinrate
      ? [item.globalWinrate, item.winrate]
      : [item.winrate, item.globalWinrate];
  return (
    <div aria-hidden className='relative h-5 w-full max-w-[260px]'>
      <div className='absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-foreground/[0.06]' />
      <div
        className='absolute top-1/2 h-0.5 -translate-y-1/2'
        style={{
          left: at(from),
          right: `calc(100% - ${at(to)})`,
          backgroundColor: tint(color, 60),
        }}
      />
      <div
        className='absolute top-1/2 h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/50'
        style={{ left: at(item.globalWinrate) }}
      />
      <div
        className='absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full'
        style={{ left: at(item.winrate), backgroundColor: tint(color, 18) }}
      />
      <div
        className='absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card'
        style={{ left: at(item.winrate), backgroundColor: color }}
      />
    </div>
  );
};

const Spotlight = ({
  item,
  asset,
  good,
}: {
  item: ItemInsight;
  asset: DeadlockItem;
  good: boolean;
}) => {
  const { t } = useTranslation();
  const color = good ? WIN_COLOR : LOSS_COLOR;
  const late = item.buyTimeDeltaS >= LATE_BUY_S;
  return (
    <Card className='stats-surface flex flex-1 flex-col gap-3.5 p-5 shadow-none'>
      <span
        className='flex items-center gap-1.5 font-bold text-[10.5px] uppercase tracking-[0.12em]'
        style={{ color }}>
        {good ? (
          <TrendingUp aria-hidden className='h-3.5 w-3.5' />
        ) : (
          <TrendingDown aria-hidden className='h-3.5 w-3.5' />
        )}
        {t(good ? "stats.items.liftsMost" : "stats.items.holdsBack")}
      </span>
      <div className='flex items-center gap-3.5'>
        <ItemTile className='h-14 w-14 rounded-xl' item={asset} />
        <div className='min-w-0'>
          <div className='truncate font-bold text-[17px] tracking-tight'>
            {asset.name}
          </div>
          <div className='text-muted-foreground text-xs'>
            {t("stats.items.gamesWith", { count: item.matches })}
          </div>
        </div>
      </div>
      <div className='flex border-border/60 border-t pt-3'>
        {(
          [
            ["stats.items.you", item.winrate, color],
            ["stats.items.everyone", item.globalWinrate, undefined],
          ] as const
        ).map(([label, value, tone]) => (
          <div className='flex flex-1 flex-col gap-1' key={label}>
            <span className='font-semibold text-[9.5px] text-muted-foreground uppercase tracking-[0.1em]'>
              {t(label)}
            </span>
            <span
              className='font-bold font-mono text-xl leading-none'
              style={{ color: tone }}>
              {formatPercent(value, 0)}
            </span>
          </div>
        ))}
      </div>
      <p className='mt-auto rounded-lg bg-background px-3 py-2.5 font-medium text-foreground/85 text-xs'>
        {t(
          good
            ? "stats.items.liftsLine"
            : late
              ? "stats.items.lateLine"
              : "stats.items.dragLine",
          {
            points: signedPoints(item.winrateDelta),
            minutes: Math.round(item.buyTimeDeltaS / 60),
          },
        )}
      </p>
    </Card>
  );
};

const EmptyState = ({
  itemsById,
}: {
  itemsById: Map<number, DeadlockItem>;
}) => {
  const { t } = useTranslation();
  const samples = SLOT_TYPES.flatMap((slot) => {
    const item = [...itemsById.values()].find(
      (entry) => entry.item_slot_type === slot && entry.item_tier === 3,
    );
    return item ? [item] : [];
  });
  return (
    <Card className='stats-surface relative overflow-hidden shadow-none'>
      <div aria-hidden className='opacity-20'>
        {Array.from({ length: 7 }, (_, row) => (
          <div
            className='flex items-center gap-5 border-border/50 border-t px-6 py-3.5 first:border-t-0'
            key={row}>
            <span
              className='h-8 w-8 rounded-md'
              style={{ backgroundColor: slotColor(SLOT_TYPES[row % 3]) }}
            />
            <span
              className='h-2.5 rounded-full bg-foreground/30'
              style={{ width: 150 - row * 8 }}
            />
            <span className='ml-16 h-0.5 w-60 bg-foreground/20' />
            <span className='h-4 w-14 rounded-full bg-foreground/15' />
          </div>
        ))}
      </div>
      <div
        aria-hidden
        className='absolute inset-0'
        style={{
          background:
            "radial-gradient(ellipse at 50% 45%, hsl(var(--card)) 30%, transparent 85%)",
        }}
      />
      <div className='absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center'>
        <div className='flex items-center'>
          {samples.map((item, index) => (
            <span
              className='-mx-1'
              key={item.id}
              style={{ transform: `rotate(${(index - 1) * 8}deg)` }}>
              <ItemTile
                className='h-12 w-12 rounded-xl border-[3px] border-card'
                item={item}
              />
            </span>
          ))}
        </div>
        <h3 className='mt-2 font-bold text-lg tracking-tight'>
          {t("stats.items.emptyTitle")}
        </h3>
        <p className='max-w-md text-muted-foreground text-sm leading-relaxed'>
          {t("stats.items.emptyDescription")}
        </p>
        <Button
          className='mt-1 gap-2'
          onClick={() => void openUrl(PATRON_URL)}
          size='sm'
          variant='outline'>
          <Zap className='h-3.5 w-3.5 text-muted-foreground' />
          {t("stats.items.emptyAction")}
        </Button>
      </div>
    </Card>
  );
};

const GRID =
  "grid grid-cols-[minmax(190px,1.3fr)_60px_minmax(200px,1.6fr)_76px_minmax(80px,0.6fr)] items-center gap-4";

interface ItemsTabProps {
  items: ItemInsight[];
  itemsById: Map<number, DeadlockItem>;
  isPending: boolean;
}

/** The player's items next to everyone else's, with the extremes called out. */
export const ItemsTab = ({ items, itemsById, isPending }: ItemsTabProps) => {
  const { t } = useTranslation();
  const [slot, setSlot] = useState<SlotFilter>("all");

  const known = useMemo(
    () => items.filter((item) => itemsById.has(item.itemId)),
    [items, itemsById],
  );
  const shown = useMemo(
    () =>
      known.filter(
        (item) =>
          slot === "all" || itemsById.get(item.itemId)?.item_slot_type === slot,
      ),
    [known, itemsById, slot],
  );
  const best = useMemo(
    () => [...known].sort((a, b) => b.winrateDelta - a.winrateDelta)[0],
    [known],
  );
  const worst = useMemo(
    () => [...known].sort((a, b) => a.winrateDelta - b.winrateDelta)[0],
    [known],
  );

  if (isPending) {
    return <Skeleton className='h-[420px] w-full rounded-xl' />;
  }
  if (known.length === 0) {
    return (
      <div className='h-[420px] pb-8'>
        <EmptyState itemsById={itemsById} />
      </div>
    );
  }

  const bestAsset = best && itemsById.get(best.itemId);
  const worstAsset = worst && itemsById.get(worst.itemId);

  return (
    <div className='grid gap-4 pb-8 xl:grid-cols-[1fr_320px]'>
      <Card className='stats-surface overflow-hidden shadow-none'>
        <div className='flex flex-wrap items-center justify-between gap-3 px-6 pt-5 pb-4'>
          <div>
            <h3 className='font-semibold text-base leading-none'>
              {t("stats.items.tableTitle")}
            </h3>
            <p className='mt-1.5 text-muted-foreground text-xs'>
              {t("stats.items.tableDescription")}
            </p>
          </div>
          <ToggleGroup
            aria-label={t("stats.items.slotFilter")}
            className='h-9 gap-0.5 rounded-lg border bg-background p-[3px]'
            onValueChange={(value) => {
              if (isSlotFilter(value)) setSlot(value);
            }}
            type='single'
            value={slot}>
            {(["all", ...SLOT_TYPES] as const).map((value) => (
              <ToggleGroupItem
                className='h-[28px] gap-1.5 rounded-md px-3 font-semibold text-[12px] text-muted-foreground data-[state=on]:bg-secondary data-[state=on]:text-foreground'
                key={value}
                value={value}>
                {value !== "all" && (
                  <span
                    className='h-2 w-2 rounded-[2px]'
                    style={{ backgroundColor: slotColor(value) }}
                  />
                )}
                {value === "all"
                  ? t("stats.items.allSlots")
                  : t(`stats.match.slots.${value}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className='overflow-x-auto'>
          <div className='min-w-[720px]'>
            <div
              className={cn(
                GRID,
                "border-border/50 border-t px-6 py-2 font-semibold text-[10px] text-muted-foreground/70 uppercase tracking-[0.1em]",
              )}>
              <span>{t("stats.items.item")}</span>
              <span>{t("stats.items.matches")}</span>
              <span>{t("stats.items.versus")}</span>
              <span>{t("stats.items.delta")}</span>
              <span>{t("stats.items.buyTime")}</span>
            </div>
            {shown.map((item) => {
              const asset = itemsById.get(item.itemId);
              if (!asset) return null;
              const good = item.winrateDelta >= 0;
              const color = good ? WIN_COLOR : LOSS_COLOR;
              return (
                <div
                  className={cn(GRID, "border-border/50 border-t px-6 py-2.5")}
                  key={item.itemId}>
                  <span className='flex min-w-0 items-center gap-3'>
                    <ItemTile className='h-9 w-9 rounded-lg' item={asset} />
                    <span className='flex min-w-0 flex-col'>
                      <span className='truncate font-semibold text-[13px]'>
                        {asset.name}
                      </span>
                      <span className='text-[11px] text-muted-foreground'>
                        {t("stats.items.tierSlot", {
                          tier: asset.item_tier ?? "-",
                          slot: isSlotType(asset.item_slot_type)
                            ? t(`stats.match.slots.${asset.item_slot_type}`)
                            : "",
                        })}
                      </span>
                    </span>
                  </span>
                  <span className='font-mono font-semibold text-[13px] tabular-nums'>
                    {item.matches}
                  </span>
                  <span className='flex items-center gap-3'>
                    <Ruler item={item} />
                    <span
                      className='font-mono font-semibold text-[11px]'
                      style={{ color }}>
                      {formatPercent(item.winrate, 0)}
                    </span>
                  </span>
                  <span>
                    <span
                      className='rounded-full px-2 py-0.5 font-mono font-semibold text-[11.5px]'
                      style={{ color, backgroundColor: tint(color, 11) }}>
                      {t("stats.items.points", {
                        value: signedPoints(item.winrateDelta),
                      })}
                    </span>
                  </span>
                  <span className='font-mono text-[12.5px] text-foreground/80'>
                    {formatClock(item.avgBuyTimeS)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </Card>
      <div className='flex flex-col gap-4'>
        {best && bestAsset && best.winrateDelta > 0 && (
          <Spotlight asset={bestAsset} good item={best} />
        )}
        {worst && worstAsset && worst.winrateDelta < 0 && (
          <Spotlight asset={worstAsset} good={false} item={worst} />
        )}
      </div>
    </div>
  );
};
