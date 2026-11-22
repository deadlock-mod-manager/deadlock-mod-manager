import { Card } from "@deadlock-mods/ui/components/card";
import { useTranslation } from "react-i18next";
import {
  HERO_TILE_CLASS,
  LOSS_COLOR,
  tint,
  WIN_COLOR,
} from "@/components/stats/chart-fx";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import type { DeadlockHero } from "@/lib/deadlock-api";
import type { BenchmarkMetric, HeroPerformance } from "@/lib/stats/derive";
import {
  formatCompact,
  formatDecimal,
  formatPercent,
  formatSignedPercent,
} from "@/lib/stats/format";
import { cn } from "@/lib/utils";

/** The bars scale to the largest gap, but never so far that a 3% gap fills one. */
const MIN_SCALE = 0.2;

const Figure = ({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) => (
  <div className='flex min-w-0 flex-1 flex-col gap-1'>
    <span className='font-semibold text-[9.5px] text-muted-foreground uppercase tracking-[0.1em]'>
      {label}
    </span>
    <span
      className='font-bold font-mono text-[17px] leading-none tabular-nums'
      style={{ color }}>
      {value}
    </span>
  </div>
);

interface HeroSpotlightProps {
  hero: HeroPerformance;
  info: DeadlockHero | undefined;
  /** Per-match gaps to everyone on the hero; empty while they load. */
  metrics: BenchmarkMetric[];
  baseline: number;
}

/**
 * One hero up close: the headline numbers, then each per-match average set
 * against everyone else on the hero. Better always points right, so fewer
 * deaths reads as a win like everything else.
 */
export const HeroSpotlight = ({
  hero,
  info,
  metrics,
  baseline,
}: HeroSpotlightProps) => {
  const { t } = useTranslation();
  const name = info?.name ?? `#${hero.heroId}`;
  const scale = Math.max(
    MIN_SCALE,
    ...metrics.map((metric) => Math.abs(metric.deltaPct)),
  );

  return (
    <Card className='stats-surface flex h-full flex-col gap-4 p-5 shadow-none'>
      <div className='flex items-center gap-3.5'>
        <HeroAvatar
          className={cn("h-14 w-14 rounded-xl", HERO_TILE_CLASS)}
          hero={info}
          heroId={hero.heroId}
        />
        <div className='min-w-0'>
          <div className='truncate font-bold text-xl tracking-tight'>
            {name}
          </div>
          <div className='text-muted-foreground text-xs'>
            {t("stats.heroes.spotlightMeta", {
              count: hero.matches,
              hours: Math.round(hero.timePlayedMin / 60),
            })}
          </div>
        </div>
      </div>

      <div className='flex gap-2 border-border/60 border-y py-3'>
        <Figure
          color={hero.winrate >= baseline ? WIN_COLOR : LOSS_COLOR}
          label={t("stats.heroes.winrate")}
          value={formatPercent(hero.winrate, 0)}
        />
        <Figure
          label={t("stats.heroes.kda")}
          value={formatDecimal(hero.kda, 1)}
        />
        <Figure
          label={t("stats.heroes.souls")}
          value={formatCompact(hero.soulsPerMin)}
        />
        <Figure
          label={t("stats.heroes.accuracy")}
          value={formatPercent(hero.accuracy, 0)}
        />
      </div>

      {metrics.length > 0 ? (
        <div className='flex flex-col gap-2.5'>
          <div className='flex items-baseline justify-between'>
            <span className='font-semibold text-[12.5px]'>
              {t("stats.heroes.versusEveryone", { hero: name })}
            </span>
            <span className='font-mono text-[10.5px] text-muted-foreground/70'>
              {t("stats.heroes.perMatch")}
            </span>
          </div>
          {metrics.map((metric) => {
            const better = metric.higherIsBetter
              ? metric.deltaPct >= 0
              : metric.deltaPct <= 0;
            const color = better ? WIN_COLOR : LOSS_COLOR;
            const share = Math.min(1, Math.abs(metric.deltaPct) / scale) * 50;
            return (
              <div className='flex items-center gap-2.5' key={metric.metric}>
                <span className='w-24 shrink-0 truncate text-[12px] text-foreground/85'>
                  {t(`stats.metrics.${metric.metric}`)}
                </span>
                <div aria-hidden className='relative h-3 flex-1'>
                  <div className='absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-foreground/[0.05]' />
                  <div className='absolute top-0 left-1/2 h-3 w-px bg-foreground/20' />
                  <div
                    className={cn(
                      "absolute top-0.5 h-2",
                      better
                        ? "left-1/2 rounded-r-[3px]"
                        : "right-1/2 rounded-l-[3px]",
                    )}
                    style={{
                      width: `${share}%`,
                      backgroundColor: tint(color, 80),
                    }}
                  />
                </div>
                <span
                  className='w-12 shrink-0 text-right font-mono font-semibold text-[11.5px] tabular-nums'
                  style={{ color }}>
                  {formatSignedPercent(metric.deltaPct, 0)}
                </span>
              </div>
            );
          })}
          <div className='flex justify-between pr-[58px] pl-[106px] font-mono text-[10px] text-muted-foreground/70'>
            <span>{t("stats.heroes.worse")}</span>
            <span>{t("stats.heroes.better")}</span>
          </div>
        </div>
      ) : (
        <p className='text-muted-foreground text-xs'>
          {t("stats.heroes.noBenchmark")}
        </p>
      )}
    </Card>
  );
};
