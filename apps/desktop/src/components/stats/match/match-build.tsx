import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { Plus } from "@deadlock-mods/ui/icons";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Cell, Pie, PieChart } from "recharts";
import { ChartCard } from "@/components/stats/chart-card";
import { LOSS_COLOR, tint, WIN_COLOR } from "@/components/stats/chart-fx";
import { ItemTile, slotColor } from "@/components/stats/match/item-tile";
import { useElementWidth } from "@/hooks/use-element-width";
import type { MatchMetadataPlayer, PerformancePoint } from "@/lib/stats/api";
import { formatClock, formatCompact } from "@/lib/stats/format";
import {
  firstOfTier,
  interpolate,
  isSlotType,
  type Purchase,
  SLOT_TYPES,
  type SlotType,
  soulsAt,
  spendBySlot,
} from "@/lib/stats/match-analysis";

const LANE_PX = 58;
const TILE_PX = 30;
const TILE_GAP_PX = 3;
const PHASES = [
  { at: 600, key: "laningEnds" },
  { at: 1200, key: "lateGame" },
] as const;

const slotOf = (purchase: Purchase): SlotType | null =>
  isSlotType(purchase.item.item_slot_type)
    ? purchase.item.item_slot_type
    : null;

/**
 * Every purchase at the minute it was made, one lane per slot, over the
 * player's souls. Tiles that would overlap are nudged right so each stays
 * readable; the tooltip keeps the real time.
 */
export const BuildTimeline = ({
  bought,
  me,
  duration,
}: {
  bought: Purchase[];
  me: MatchMetadataPlayer;
  duration: number;
}) => {
  const { t } = useTranslation();
  const { ref, width } = useElementWidth();
  const x = (time: number) => (time / duration) * width;

  const placed = useMemo(() => {
    const lastEdge = {
      weapon: -Infinity,
      vitality: -Infinity,
      spirit: -Infinity,
    };
    return bought.flatMap((purchase) => {
      const slot = slotOf(purchase);
      if (!slot || width === 0) return [];
      const left = Math.max(
        (purchase.time / duration) * width - TILE_PX / 2,
        lastEdge[slot] + TILE_GAP_PX,
        0,
      );
      lastEdge[slot] = left + TILE_PX;
      return [{ purchase, slot, left }];
    });
  }, [bought, duration, width]);

  const souls = me.stats.map(
    (stat) => [stat.time_stamp_s, stat.net_worth] as const,
  );
  const maxSouls = Math.max(1, ...souls.map(([, value]) => value)) * 1.06;
  const height = LANE_PX * SLOT_TYPES.length;
  const curve = [[0, 0] as const, ...souls]
    .map(
      ([time, value], index) =>
        `${index === 0 ? "M" : "L"}${time},${maxSouls - value}`,
    )
    .join(" ");
  const spikes = [3, 4].flatMap((tier) => {
    const first = firstOfTier(bought, tier);
    return first ? [{ tier, purchase: first }] : [];
  });

  const ticks = Array.from(
    { length: Math.floor(duration / 300) + 1 },
    (_, index) => index * 300,
  );

  return (
    <ChartCard
      action={
        <div className='flex shrink-0 flex-wrap items-center gap-4 text-[11.5px] text-muted-foreground'>
          {SLOT_TYPES.map((slot) => (
            <span className='flex items-center gap-1.5' key={slot}>
              <span
                className='h-2.5 w-2.5 rounded-[3px]'
                style={{ backgroundColor: slotColor(slot) }}
              />
              {t(`stats.match.slots.${slot}`)}
            </span>
          ))}
          <span className='flex items-center gap-1.5'>
            <span className='h-0.5 w-3.5 bg-primary' />
            {t("stats.match.yourSouls")}
          </span>
        </div>
      }
      description={t("stats.match.timelineDescription")}
      title={t("stats.match.timeline")}>
      <div className='flex gap-3'>
        <div className='flex w-20 shrink-0 flex-col'>
          {SLOT_TYPES.map((slot) => (
            <div
              className='flex items-center gap-2 font-medium text-[12.5px]'
              key={slot}
              style={{ height: LANE_PX }}>
              <span
                className='h-2 w-2 rounded-[2px]'
                style={{ backgroundColor: slotColor(slot) }}
              />
              {t(`stats.match.slots.${slot}`)}
            </div>
          ))}
        </div>
        <div className='min-w-0 flex-1'>
          <div className='relative' ref={ref} style={{ height: height + 24 }}>
            {SLOT_TYPES.map((slot, lane) => (
              <div
                className='absolute inset-x-0 rounded-lg bg-foreground/[0.025]'
                key={slot}
                style={{ top: lane * LANE_PX + 4, height: LANE_PX - 8 }}
              />
            ))}
            <svg
              aria-hidden
              className='pointer-events-none absolute inset-x-0 top-0'
              height={height}
              preserveAspectRatio='none'
              viewBox={`0 0 ${duration} ${maxSouls}`}
              width='100%'>
              <path
                d={`${curve} L${souls[souls.length - 1]?.[0] ?? 0},${maxSouls} L0,${maxSouls} Z`}
                fill='hsl(var(--primary))'
                fillOpacity={0.07}
              />
              <path
                d={curve}
                fill='none'
                stroke='hsl(var(--primary))'
                strokeOpacity={0.45}
                strokeWidth={1.5}
                vectorEffect='non-scaling-stroke'
              />
            </svg>
            {PHASES.filter((phase) => phase.at < duration).map((phase) => (
              <div
                className='absolute top-0 border-foreground/10 border-l'
                key={phase.key}
                style={{ left: x(phase.at), height }}>
                <span className='absolute -top-0.5 left-1 whitespace-nowrap rounded bg-card px-1 font-mono text-[9.5px] text-muted-foreground/80'>
                  {t(`stats.match.phases.${phase.key}`)}
                </span>
              </div>
            ))}
            {placed.map(({ purchase, slot, left }) => {
              const top =
                SLOT_TYPES.indexOf(slot) * LANE_PX + (LANE_PX - TILE_PX) / 2;
              return (
                <div key={`${purchase.item.id}-${purchase.time}`}>
                  {purchase.soldAt !== null && (
                    <>
                      <div
                        aria-hidden
                        className='absolute h-px'
                        style={{
                          left: left + TILE_PX,
                          top: top + TILE_PX / 2,
                          width: Math.max(
                            4,
                            x(purchase.soldAt) - left - TILE_PX,
                          ),
                          backgroundColor: tint(slotColor(slot), 35),
                        }}
                      />
                      <div
                        aria-hidden
                        className='absolute h-2.5 w-0.5 rounded-full'
                        style={{
                          left: Math.max(
                            left + TILE_PX + 2,
                            x(purchase.soldAt),
                          ),
                          top: top + TILE_PX / 2 - 5,
                          backgroundColor: tint(slotColor(slot), 70),
                        }}
                      />
                    </>
                  )}
                  <div className='absolute' style={{ left, top }}>
                    <ItemTile
                      className='h-[30px] w-[30px]'
                      faded={purchase.soldAt !== null}
                      hint={
                        purchase.soldAt === null
                          ? t("stats.match.boughtAt", {
                              time: formatClock(purchase.time),
                            })
                          : t("stats.match.boughtAndSold", {
                              bought: formatClock(purchase.time),
                              sold: formatClock(purchase.soldAt),
                            })
                      }
                      item={purchase.item}
                    />
                  </div>
                </div>
              );
            })}
            {spikes.map(({ tier, purchase }) => (
              <div
                className='absolute flex flex-col items-center'
                key={tier}
                style={{
                  left: x(purchase.time),
                  top: height - 6,
                  transform: "translateX(-50%)",
                }}>
                <span className='h-2 w-px bg-primary/40' />
                <span className='whitespace-nowrap rounded-full bg-primary/10 px-1.5 font-mono font-semibold text-[9.5px] text-primary'>
                  {t("stats.match.firstTier", {
                    tier,
                    time: formatClock(purchase.time),
                  })}
                </span>
              </div>
            ))}
          </div>
          <div className='relative mt-1 h-3 font-mono text-[10px] text-muted-foreground/70'>
            {ticks.map((tick) => (
              <span
                className='absolute -translate-x-1/2 first:translate-x-0'
                key={tick}
                style={{ left: x(tick) }}>
                {formatClock(tick)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </ChartCard>
  );
};

/** Souls spent per slot as a donut, the biggest share in the middle. */
export const SoulsSpent = ({ bought }: { bought: Purchase[] }) => {
  const { t, i18n } = useTranslation();
  const spend = spendBySlot(bought);
  const total = SLOT_TYPES.reduce((sum, slot) => sum + spend[slot], 0);
  const data = SLOT_TYPES.map((slot) => ({ slot, value: spend[slot] })).sort(
    (a, b) => b.value - a.value,
  );
  const top = data[0];

  return (
    <ChartCard
      description={t("stats.match.spentDescription", {
        souls: total.toLocaleString(i18n.language),
        count: bought.length,
      })}
      title={t("stats.match.spent")}>
      <div className='flex h-full items-center gap-6'>
        <div className='relative h-[140px] w-[140px] shrink-0'>
          <PieChart height={140} width={140}>
            <Pie
              cornerRadius={3}
              data={data}
              dataKey='value'
              endAngle={-270}
              innerRadius={52}
              isAnimationActive={false}
              outerRadius={68}
              paddingAngle={2}
              startAngle={90}
              stroke='none'>
              {data.map((entry) => (
                <Cell
                  fill={slotColor(entry.slot)}
                  key={entry.slot}
                  style={{
                    filter: `drop-shadow(0 0 5px ${tint(slotColor(entry.slot), 40)})`,
                  }}
                />
              ))}
            </Pie>
          </PieChart>
          {top && total > 0 && (
            <div className='absolute inset-0 flex flex-col items-center justify-center'>
              <span className='font-bold text-2xl leading-none tabular-nums'>
                {Math.round((top.value / total) * 100)}%
              </span>
              <span className='mt-1 text-[11px] text-muted-foreground'>
                {t(`stats.match.slots.${top.slot}`)}
              </span>
            </div>
          )}
        </div>
        <ul className='flex flex-col gap-3'>
          {data.map((entry) => (
            <li className='flex flex-col gap-0.5' key={entry.slot}>
              <span className='flex items-center gap-2 font-medium text-[12.5px]'>
                <span
                  className='h-2 w-2 rounded-[2px]'
                  style={{ backgroundColor: slotColor(entry.slot) }}
                />
                {t(`stats.match.slots.${entry.slot}`)}
              </span>
              <span className='pl-4 font-mono text-[11px] text-muted-foreground'>
                {t("stats.match.soulsAmount", {
                  souls: entry.value.toLocaleString(i18n.language),
                })}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </ChartCard>
  );
};

const CHECKPOINTS = [600, 1200, 1800];
const MIN_BASELINE_SAMPLES = 5;

const Delta = ({ good, text }: { good: boolean; text: string }) => (
  <span
    className='shrink-0 rounded-full px-2 py-0.5 font-mono font-semibold text-[11px]'
    style={{
      color: good ? WIN_COLOR : LOSS_COLOR,
      backgroundColor: tint(good ? WIN_COLOR : LOSS_COLOR, 11),
    }}>
    {text}
  </span>
);

/**
 * This match against the player's usual one on the hero: buy times for the two
 * power spikes and souls at fixed minutes. Earlier and richer read as good.
 */
export const TimingCompare = ({
  bought,
  me,
  duration,
  heroName,
  buyTimes,
  curve,
  isPending,
}: {
  bought: Purchase[];
  me: MatchMetadataPlayer;
  duration: number;
  heroName: string;
  buyTimes: Map<number, number>;
  curve: PerformancePoint[];
  isPending: boolean;
}) => {
  const { t } = useTranslation();
  const usualCurve = curve
    // A handful of parsed games is not a habit; below that there is nothing to compare.
    .filter((point) => point.samples >= MIN_BASELINE_SAMPLES)
    .map((point): [number, number] => [point.game_time, point.net_worth_avg])
    .sort((a, b) => a[0] - b[0]);

  const items = [3, 4].flatMap((tier) => {
    const first = firstOfTier(bought, tier);
    const usual = first ? buyTimes.get(first.item.id) : undefined;
    return first && usual ? [{ first, usual }] : [];
  });
  const checkpoints = CHECKPOINTS.filter(
    (time) => time <= duration && usualCurve.some(([at]) => at >= time),
  );

  const body = (() => {
    if (isPending) {
      return (
        <div className='flex flex-col gap-3 pt-1'>
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton className='h-7 w-full' key={index} />
          ))}
        </div>
      );
    }
    if (items.length === 0 && checkpoints.length === 0) {
      return (
        <p className='py-8 text-center text-muted-foreground text-sm'>
          {t("stats.match.noBaseline")}
        </p>
      );
    }
    return (
      <div className='flex flex-col'>
        {items.map(({ first, usual }) => {
          const diff = first.time - usual;
          return (
            <div
              className='flex items-center gap-4 border-border/50 border-t py-2.5 first:border-t-0'
              key={first.item.id}>
              <span className='flex w-40 min-w-0 items-center gap-2'>
                <ItemTile className='h-5 w-5 rounded' item={first.item} />
                <span className='truncate font-medium text-[12.5px]'>
                  {first.item.name}
                </span>
              </span>
              <span className='flex flex-1 items-baseline gap-2.5'>
                <span className='font-mono font-semibold text-sm'>
                  {formatClock(first.time)}
                </span>
                <span className='font-mono text-[11px] text-muted-foreground/70'>
                  {t("stats.match.usually", { value: formatClock(usual) })}
                </span>
              </span>
              <Delta
                good={diff <= 0}
                text={t(
                  diff <= 0 ? "stats.match.earlier" : "stats.match.later",
                  {
                    time: formatClock(Math.abs(diff)),
                  },
                )}
              />
            </div>
          );
        })}
        {checkpoints.map((time) => {
          const mine = soulsAt(me.stats, time);
          const usual = interpolate(usualCurve, time);
          const change =
            usual > 0 ? Math.round(((mine - usual) / usual) * 100) : 0;
          return (
            <div
              className='flex items-center gap-4 border-border/50 border-t py-2.5 first:border-t-0'
              key={time}>
              <span className='w-40 font-medium text-[12.5px]'>
                {t("stats.match.soulsAtTime", { time: formatClock(time) })}
              </span>
              <span className='flex flex-1 items-baseline gap-2.5'>
                <span className='font-mono font-semibold text-sm'>
                  {formatCompact(mine)}
                </span>
                <span className='font-mono text-[11px] text-muted-foreground/70'>
                  {t("stats.match.usually", { value: formatCompact(usual) })}
                </span>
              </span>
              <Delta
                good={change >= 0}
                text={`${change > 0 ? "+" : ""}${change}%`}
              />
            </div>
          );
        })}
      </div>
    );
  })();

  return (
    <ChartCard
      description={t("stats.match.compareDescription", { hero: heroName })}
      title={t("stats.match.compare")}>
      {body}
    </ChartCard>
  );
};

const SLOTS_PER_TYPE = 4;
const EMPTY_KEYS = ["a", "b", "c", "d"] as const;

/** What the player ended the match holding, one row per slot type. */
export const FinalBuild = ({ bought }: { bought: Purchase[] }) => {
  const { t } = useTranslation();
  const held = bought.filter((purchase) => purchase.soldAt === null);
  const bySlot = (slot: SlotType) =>
    held.filter((purchase) => slotOf(purchase) === slot);

  return (
    <ChartCard
      description={t("stats.match.finalDescription")}
      title={t("stats.match.final")}>
      <div className='flex flex-col gap-2'>
        {SLOT_TYPES.map((slot) => {
          const items = bySlot(slot);
          const empty = Math.max(0, SLOTS_PER_TYPE - items.length);
          return (
            <div className='grid grid-cols-4 gap-2' key={slot}>
              {items.map((purchase) => (
                <ItemTile
                  className='aspect-square h-auto w-full rounded-lg'
                  item={purchase.item}
                  key={`${purchase.item.id}-${purchase.time}`}
                />
              ))}
              {EMPTY_KEYS.slice(0, empty).map((key) => (
                <div
                  aria-hidden
                  className='flex aspect-square items-center justify-center rounded-lg border'
                  key={key}
                  style={{
                    borderColor: tint(slotColor(slot), 35),
                    backgroundColor: tint(slotColor(slot), 5),
                  }}>
                  <Plus
                    className='h-3.5 w-3.5'
                    style={{ color: tint(slotColor(slot), 60) }}
                  />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
};
