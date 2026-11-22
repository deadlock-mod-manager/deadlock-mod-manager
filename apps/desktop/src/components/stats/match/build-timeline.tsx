import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ChartCard } from "@/components/stats/chart-card";
import { tint } from "@/components/stats/chart-fx";
import { ItemTile, slotColor } from "@/components/stats/match/item-tile";
import { useElementWidth } from "@/hooks/use-element-width";
import type { MatchMetadataPlayer } from "@/lib/stats/api";
import { formatClock } from "@/lib/stats/format";
import {
  firstOfTier,
  type Purchase,
  SLOT_TYPES,
} from "@/lib/stats/match-analysis";
import { slotOf } from "./purchase-slot";

const LANE_PX = 58;

const TILE_PX = 30;

const TILE_GAP_PX = 3;

const PHASES = [
  { at: 600, key: "laningEnds" },
  { at: 1200, key: "lateGame" },
] as const;

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
