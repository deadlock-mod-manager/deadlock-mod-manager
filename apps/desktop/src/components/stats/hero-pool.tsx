import { ArrowRight, Sparkles } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ChartCard } from "@/components/stats/chart-card";
import {
  HERO_TILE_CLASS,
  LOSS_COLOR,
  NOTE_CLASS,
  WIN_COLOR,
} from "@/components/stats/chart-fx";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import type { DeadlockHero } from "@/lib/deadlock-api";
import type { HeroPerformance } from "@/lib/stats/derive";
import { formatDecimal, formatPercent } from "@/lib/stats/format";
import { cn } from "@/lib/utils";

const SHOWN = 6;
/** A hidden gem needs enough games that its winrate isn't a coin flip. */
const GEM_MIN_MATCHES = 10;
const GEM_SKIP_TOP = 3;

interface HeroPoolProps {
  heroes: HeroPerformance[];
  heroesById: Map<number, DeadlockHero>;
  /** The link to the Heroes tab; off where there is no such tab, like a player card. */
  showAllLink?: boolean;
  /** Makes each row open that hero's breakdown. */
  onSelectHero?: (heroId: number) => void;
}

/**
 * Where the games go: the most played heroes, sized by games and marked with
 * their winrate, plus the one hero that deserves more of them.
 */
export const HeroPool = ({
  heroes,
  heroesById,
  showAllLink = true,
  onSelectHero,
}: HeroPoolProps) => {
  const { t } = useTranslation();
  const top = heroes.slice(0, SHOWN);
  const most = top[0]?.matches ?? 0;
  if (top.length === 0 || most === 0) {
    return null;
  }

  // The best winrate outside the heroes the player already lives on, so the
  // note says something new.
  const gem = heroes
    .slice(GEM_SKIP_TOP)
    .filter((hero) => hero.matches >= GEM_MIN_MATCHES && hero.winrate > 0.5)
    .sort((a, b) => b.winrate - a.winrate)[0];

  return (
    <ChartCard
      action={
        showAllLink && (
          <Link
            className='flex shrink-0 items-center gap-1 font-semibold text-muted-foreground text-xs transition-colors hover:text-foreground'
            to={{ search: "?tab=heroes" }}>
            {t("stats.pool.all", { count: heroes.length })}
            <ArrowRight aria-hidden className='h-3.5 w-3.5' />
          </Link>
        )
      }
      description={t("stats.pool.description")}
      title={t("stats.pool.title")}>
      <div className='flex h-full flex-col gap-4'>
        <ul className='flex flex-col gap-4'>
          {top.map((hero) => {
            const info = heroesById.get(hero.heroId);
            return (
              <li
                className={cn(
                  "relative flex items-center gap-3.5",
                  onSelectHero &&
                    "rounded-lg transition-colors hover:bg-accent/30",
                )}
                key={hero.heroId}>
                {onSelectHero && (
                  <button
                    aria-label={t("stats.hero.openHero", {
                      hero: info?.name ?? `#${hero.heroId}`,
                    })}
                    className='absolute inset-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                    onClick={() => onSelectHero(hero.heroId)}
                    type='button'
                  />
                )}
                <HeroAvatar
                  className={cn("h-10 w-10", HERO_TILE_CLASS)}
                  hero={info}
                  heroId={hero.heroId}
                />
                <div className='flex min-w-0 flex-1 flex-col gap-2'>
                  <div className='flex items-baseline justify-between gap-2'>
                    <span className='truncate font-semibold text-[13.5px]'>
                      {info?.name ?? `#${hero.heroId}`}
                    </span>
                    <span className='flex shrink-0 gap-3 font-mono text-[11px] text-muted-foreground/80'>
                      <span>
                        {t("stats.pool.games", { count: hero.matches })}
                      </span>
                      <span>
                        {t("stats.pool.kda", {
                          value: formatDecimal(hero.kda, 1),
                        })}
                      </span>
                    </span>
                  </div>
                  <div className='h-1.5 overflow-hidden rounded-full bg-foreground/[0.06]'>
                    <div
                      className='h-full rounded-full'
                      style={{
                        width: `${Math.max(2, (hero.matches / most) * 100)}%`,
                        background:
                          "linear-gradient(90deg, color-mix(in srgb, hsl(var(--primary)) 25%, transparent), hsl(var(--primary)))",
                      }}
                    />
                  </div>
                </div>
                <span
                  className='w-12 shrink-0 text-right font-medium text-sm tabular-nums'
                  style={{
                    color: hero.winrate >= 0.5 ? WIN_COLOR : LOSS_COLOR,
                  }}>
                  {formatPercent(hero.winrate, 0)}
                </span>
              </li>
            );
          })}
        </ul>
        {gem && (
          <p className={cn(NOTE_CLASS, "mt-auto")}>
            <Sparkles
              aria-hidden
              className='h-3.5 w-3.5 shrink-0 text-primary'
            />
            {t("stats.pool.gem", {
              hero: heroesById.get(gem.heroId)?.name ?? `#${gem.heroId}`,
              winrate: formatPercent(gem.winrate, 0),
              count: gem.matches,
            })}
          </p>
        )}
      </div>
    </ChartCard>
  );
};
