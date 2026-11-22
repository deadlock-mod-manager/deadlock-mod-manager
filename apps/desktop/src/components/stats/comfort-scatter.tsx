import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { useTranslation } from "react-i18next";
import { ChartCard } from "@/components/stats/chart-card";
import { LOSS_COLOR, tint, WIN_COLOR } from "@/components/stats/chart-fx";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import type { DeadlockHero } from "@/lib/deadlock-api";
import type { HeroPerformance } from "@/lib/stats/derive";
import { formatPercent } from "@/lib/stats/format";
import { cn } from "@/lib/utils";

const PLOT_PX = 300;
const DOT_MIN_PX = 26;
const DOT_MAX_PX = 42;
const X_TICKS = [1, 5, 15, 30, 60, 120, 250];

interface ComfortScatterProps {
  heroes: HeroPerformance[];
  heroesById: Map<number, DeadlockHero>;
  /** Overall winrate: the line between comfort picks and traps. */
  baseline: number;
  selectedHeroId: number | null;
  onSelect: (heroId: number) => void;
}

/**
 * Games played against winrate, each hero as its own portrait. Games run on a
 * square-root scale so one-game heroes don't crowd into the left edge, and the
 * right-hand zones mark heroes with enough games for their winrate to mean
 * something: above your line a comfort pick, below it a trap.
 */
export const ComfortScatter = ({
  heroes,
  heroesById,
  baseline,
  selectedHeroId,
  onSelect,
}: ComfortScatterProps) => {
  const { t } = useTranslation();
  const maxGames = Math.max(1, ...heroes.map((hero) => hero.matches));
  const x = (games: number) => Math.sqrt(games / maxGames);
  const zoneStart = x(Math.max(5, Math.round(maxGames * 0.25)));
  const ticks = X_TICKS.filter((tick) => tick < maxGames * 0.9);

  return (
    <ChartCard
      action={
        <div className='flex shrink-0 items-center gap-4 text-[11.5px] text-muted-foreground'>
          {(
            [
              [WIN_COLOR, "stats.heroes.aboveLine"],
              [LOSS_COLOR, "stats.heroes.belowLine"],
            ] as const
          ).map(([color, label]) => (
            <span className='flex items-center gap-1.5' key={label}>
              <span
                className='h-2.5 w-2.5 rounded-full border-2'
                style={{ borderColor: color }}
              />
              {t(label, { value: formatPercent(baseline, 0) })}
            </span>
          ))}
        </div>
      }
      description={t("stats.heroes.scatterDescription")}
      title={t("stats.charts.scatterTitle")}>
      <div className='flex gap-3'>
        <div className='min-w-0 flex-1'>
          <div
            className='stats-dot-grid relative rounded-md'
            style={{ height: PLOT_PX }}>
            {/* Inset so dots on the edges stay whole. */}
            <div className='absolute inset-[22px]'>
              <div
                className='absolute right-0 rounded-t-lg'
                style={{
                  left: `${zoneStart * 100}%`,
                  top: 0,
                  bottom: `${baseline * 100}%`,
                  backgroundColor: tint(WIN_COLOR, 4),
                }}>
                <span
                  className='absolute top-2 right-3 font-semibold text-[10px] uppercase tracking-[0.12em]'
                  style={{ color: tint(WIN_COLOR, 60) }}>
                  {t("stats.heroes.comfortZone")}
                </span>
              </div>
              <div
                className='absolute right-0 bottom-0 rounded-b-lg'
                style={{
                  left: `${zoneStart * 100}%`,
                  top: `${(1 - baseline) * 100}%`,
                  backgroundColor: tint(LOSS_COLOR, 4),
                }}>
                <span
                  className='absolute right-3 bottom-2 font-semibold text-[10px] uppercase tracking-[0.12em]'
                  style={{ color: tint(LOSS_COLOR, 60) }}>
                  {t("stats.heroes.trapZone")}
                </span>
              </div>
              <div
                aria-hidden
                className='absolute inset-x-0 border-primary/35 border-t border-dashed'
                style={{ top: `${(1 - baseline) * 100}%` }}>
                <span className='absolute -top-[22px] left-0 rounded border border-border bg-card px-1.5 py-px font-mono text-[10px] text-muted-foreground'>
                  {t("stats.form.baseline", {
                    value: formatPercent(baseline, 0),
                  })}
                </span>
              </div>
              {heroes.map((hero) => {
                const size =
                  DOT_MIN_PX +
                  (DOT_MAX_PX - DOT_MIN_PX) * Math.min(1, hero.matches / 60);
                const isSelected = hero.heroId === selectedHeroId;
                const info = heroesById.get(hero.heroId);
                const ring = isSelected
                  ? "hsl(var(--primary))"
                  : hero.winrate >= baseline
                    ? WIN_COLOR
                    : LOSS_COLOR;
                return (
                  <Tooltip key={hero.heroId}>
                    <TooltipTrigger asChild>
                      <button
                        aria-label={t("stats.heroes.selectHero", {
                          hero: info?.name ?? `#${hero.heroId}`,
                        })}
                        aria-pressed={isSelected}
                        className={cn(
                          "absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full transition-transform hover:z-20 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          isSelected && "z-10",
                        )}
                        onClick={() => onSelect(hero.heroId)}
                        style={{
                          left: `${x(hero.matches) * 100}%`,
                          top: `${(1 - hero.winrate) * 100}%`,
                          boxShadow: isSelected
                            ? `0 0 0 6px ${tint("hsl(var(--primary))", 14)}`
                            : undefined,
                        }}
                        type='button'>
                        <span
                          className='block overflow-hidden rounded-full border-2 bg-background'
                          style={{
                            width: size,
                            height: size,
                            borderColor: ring,
                          }}>
                          <HeroAvatar
                            className='h-full w-full rounded-full'
                            hero={info}
                            heroId={hero.heroId}
                          />
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {t("stats.charts.scatterTooltip", {
                        winrate: formatPercent(hero.winrate, 0),
                        matches: hero.matches,
                        hours: Math.round(hero.timePlayedMin / 60),
                      })}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
          <div className='relative mx-[22px] mt-2 h-3 font-mono text-[10px] text-muted-foreground/70'>
            {[...ticks, maxGames].map((tick) => (
              <span
                className='absolute -translate-x-1/2'
                key={tick}
                style={{ left: `${x(tick) * 100}%` }}>
                {tick === maxGames
                  ? t("stats.heroes.gamesTick", { count: tick })
                  : tick}
              </span>
            ))}
          </div>
        </div>
        <div
          aria-hidden
          className='relative w-8 shrink-0 font-mono text-[10px] text-muted-foreground/70'
          style={{ height: PLOT_PX }}>
          {[1, 0.75, 0.5, 0.25, 0].map((value) => (
            <span
              className='absolute -translate-y-1/2'
              key={value}
              style={{ top: `calc(22px + ${(1 - value) * (PLOT_PX - 44)}px)` }}>
              {formatPercent(value, 0)}
            </span>
          ))}
        </div>
      </div>
    </ChartCard>
  );
};
