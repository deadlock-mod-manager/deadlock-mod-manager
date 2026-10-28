import { Card } from "@deadlock-mods/ui/components/card";
import { Loader2 } from "@deadlock-mods/ui/icons";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import type { LiveScoreboardPlayer } from "@/hooks/use-live-match";
import { useLiveHeroBenchmark } from "@/hooks/use-player-stats";
import type { DeadlockHero } from "@/lib/deadlock-api";
import { type RankAsset, resolveRank } from "@/lib/stats/api";
import {
  clockMinutes,
  GRADE_STARTS,
  GRADES,
  type Grade,
  type LiveMetric,
  liveGradeRows,
  MIN_GRADED_MINUTES,
} from "@/lib/stats/live-grades";
import type { StatsScope } from "@/lib/stats/scope";
import { cn } from "@/lib/utils";

const GRADE_STYLES = {
  D: { pill: "bg-red-500/15 text-red-400", zone: "bg-red-500/30" },
  C: { pill: "bg-orange-500/15 text-orange-400", zone: "bg-orange-500/30" },
  B: { pill: "bg-emerald-500/15 text-emerald-400", zone: "bg-emerald-500/30" },
  A: { pill: "bg-amber-500/15 text-amber-400", zone: "bg-amber-500/30" },
  S: { pill: "bg-sky-500/15 text-sky-400", zone: "bg-sky-500/30" },
} satisfies Record<Grade, { pill: string; zone: string }>;

const PER_MINUTE = new Set<LiveMetric>([
  "soulsPerMin",
  "objectiveDamagePerMin",
]);

const formatValue = (metric: LiveMetric, value: number) =>
  PER_MINUTE.has(metric) ? Math.round(value).toString() : value.toFixed(0);

const formatAverage = (metric: LiveMetric, value: number) =>
  PER_MINUTE.has(metric) ? Math.round(value).toString() : value.toFixed(1);

interface LivePerformanceProps {
  player: LiveScoreboardPlayer;
  hero: DeadlockHero | undefined;
  clock: string | null;
  badge: number | undefined;
  rankAssets: RankAsset[];
  scope: StatsScope;
}

/**
 * The local player's match so far, graded against players on the same hero in
 * their rank bracket.
 */
export const LivePerformance = ({
  player,
  hero,
  clock,
  badge,
  rankAssets,
  scope,
}: LivePerformanceProps) => {
  const { t } = useTranslation();
  const benchmark = useLiveHeroBenchmark(hero?.id ?? null, badge, scope);
  const minutes = clockMinutes(clock);
  const bracket = resolveRank(badge, rankAssets).name;

  const rows = useMemo(
    () =>
      minutes === null
        ? []
        : liveGradeRows({
            player,
            minutes,
            curve: benchmark.data?.data ?? [],
          }),
    [player, minutes, benchmark.data],
  );

  const renderBody = () => {
    if (!hero) {
      return t("stats.live.performance.unknownHero");
    }
    if (minutes === null || minutes < MIN_GRADED_MINUTES) {
      return t("stats.live.performance.firstMinute");
    }
    if (benchmark.isPending) {
      return (
        <span className='flex items-center gap-2'>
          <Loader2 className='h-4 w-4 animate-spin' />
          {t("stats.live.performance.loading")}
        </span>
      );
    }
    if (benchmark.isError || rows.length === 0) {
      return t("stats.live.performance.unavailable");
    }
    return null;
  };
  const notice = renderBody();

  return (
    <Card className='flex flex-col gap-3 p-3 shadow-none'>
      <div className='flex flex-col gap-1.5'>
        <span className='text-muted-foreground text-xs uppercase tracking-wide'>
          {t("stats.live.performance.playingAs")}
        </span>
        <div className='flex items-center gap-2'>
          <HeroAvatar
            className='h-8 w-8'
            hero={hero}
            heroId={hero?.id ?? player.heroId ?? 0}
          />
          <span className='font-semibold'>
            {hero?.name ?? player.heroName ?? player.name}
          </span>
        </div>
        {hero && (
          <span className='text-muted-foreground text-xs'>
            {bracket
              ? t("stats.live.performance.versusBracket", {
                  hero: hero.name,
                  bracket,
                })
              : t("stats.live.performance.versusEveryone", { hero: hero.name })}
          </span>
        )}
      </div>

      {notice ? (
        <div className='py-8 text-center text-muted-foreground text-sm'>
          {notice}
        </div>
      ) : (
        <div className='flex flex-col divide-y'>
          {rows.map((row) => (
            <div
              className='grid grid-cols-[6.5rem_minmax(0,1fr)_2rem] items-center gap-3 py-2'
              key={row.metric}>
              <div className='flex flex-col'>
                <span className='text-muted-foreground text-xs uppercase'>
                  {t(`stats.live.performance.metrics.${row.metric}`)}
                </span>
                <span className='font-semibold text-lg tabular-nums'>
                  {formatValue(row.metric, row.value)}
                </span>
              </div>
              <div className='flex flex-col gap-1'>
                {/* One zone per grade, sized by the share of the bracket it covers. */}
                <div className='relative flex h-2 overflow-hidden rounded-full'>
                  {GRADES.map((grade, index) => (
                    <span
                      className={cn(
                        "h-full",
                        GRADE_STYLES[grade].zone,
                        index > 0 && "border-background border-l",
                      )}
                      key={grade}
                      style={{
                        width: `${((GRADE_STARTS[index + 1] ?? 1) - GRADE_STARTS[index]) * 100}%`,
                      }}
                    />
                  ))}
                  <span
                    aria-hidden
                    className='absolute inset-y-0 w-1 -translate-x-1/2 rounded-full bg-foreground'
                    style={{ left: `${row.beats * 100}%` }}
                  />
                </div>
                <span className='text-muted-foreground text-xs tabular-nums'>
                  {t("stats.live.performance.average", {
                    value: formatAverage(row.metric, row.average),
                  })}
                </span>
              </div>
              <span
                className={cn(
                  "rounded-md py-0.5 text-center font-bold text-sm",
                  GRADE_STYLES[row.grade].pill,
                )}>
                {row.grade}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
