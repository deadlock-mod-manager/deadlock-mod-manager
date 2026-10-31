import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { useTranslation } from "react-i18next";
import { ChartCard } from "@/components/stats/chart-card";
import { ItemTile } from "@/components/stats/match/item-tile";
import type { MatchMetadataPlayer, PerformancePoint } from "@/lib/stats/api";
import { formatClock, formatCompact } from "@/lib/stats/format";
import {
  firstOfTier,
  interpolate,
  type Purchase,
  soulsAt,
} from "@/lib/stats/match-analysis";
import { Delta } from "./timing-delta";

const CHECKPOINTS = [600, 1200, 1800];

const MIN_BASELINE_SAMPLES = 5;

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
