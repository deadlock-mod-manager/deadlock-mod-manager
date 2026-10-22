import { Card } from "@deadlock-mods/ui/components/card";
import { ArrowDown } from "@deadlock-mods/ui/icons";
import { formatDistanceToNow } from "date-fns";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  HERO_TILE_CLASS,
  LOSS_COLOR,
  tint,
  WIN_COLOR,
} from "@/components/stats/chart-fx";
import { ComfortScatter } from "@/components/stats/comfort-scatter";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import { HeroSpotlight } from "@/components/stats/hero-spotlight";
import type { DeadlockHero } from "@/lib/deadlock-api";
import type { BenchmarkMetric, HeroPerformance } from "@/lib/stats/derive";
import {
  formatCompact,
  formatDecimal,
  formatPercent,
} from "@/lib/stats/format";
import { cn } from "@/lib/utils";

type SortKey = "matches" | "winrate" | "kda" | "soulsPerMin" | "accuracy";

const GRID =
  "grid grid-cols-[minmax(170px,1.4fr)_minmax(150px,1.3fr)_90px_70px_90px_80px_minmax(90px,1fr)] items-center gap-4";

interface HeroesTabProps {
  heroes: HeroPerformance[];
  heroesById: Map<number, DeadlockHero>;
  careerWinrate: number;
  benchmarkFor: (heroId: number) => BenchmarkMetric[];
}

export const HeroesTab = ({
  heroes,
  heroesById,
  careerWinrate,
  benchmarkFor,
}: HeroesTabProps) => {
  const { t } = useTranslation();
  const [sortKey, setSortKey] = useState<SortKey>("matches");
  const [selectedHeroId, setSelectedHeroId] = useState<number | null>(null);

  const sorted = useMemo(
    () => [...heroes].sort((a, b) => b[sortKey] - a[sortKey]),
    [heroes, sortKey],
  );
  const mostGames = Math.max(1, ...heroes.map((hero) => hero.matches));

  const activeHeroId = selectedHeroId ?? sorted[0]?.heroId ?? null;
  const activeHero = heroes.find((hero) => hero.heroId === activeHeroId);

  if (heroes.length === 0 || !activeHero) {
    return (
      <p className='py-10 text-center text-muted-foreground text-sm'>
        {t("stats.heroes.empty")}
      </p>
    );
  }

  const columns: Array<{ key: SortKey; label: string }> = [
    { key: "matches", label: t("stats.heroes.matches") },
    { key: "winrate", label: t("stats.heroes.winrate") },
    { key: "kda", label: t("stats.heroes.kda") },
    { key: "soulsPerMin", label: t("stats.heroes.souls") },
    { key: "accuracy", label: t("stats.heroes.accuracy") },
  ];

  return (
    <div className='flex flex-col gap-4 pb-8'>
      <div className='grid gap-4 xl:grid-cols-[1fr_380px]'>
        <ComfortScatter
          baseline={careerWinrate}
          heroes={heroes}
          heroesById={heroesById}
          onSelect={setSelectedHeroId}
          selectedHeroId={activeHeroId}
        />
        <HeroSpotlight
          baseline={careerWinrate}
          hero={activeHero}
          info={heroesById.get(activeHero.heroId)}
          metrics={benchmarkFor(activeHero.heroId)}
        />
      </div>

      <Card className='stats-surface overflow-hidden shadow-none'>
        <div className='px-6 pt-5 pb-4'>
          <h3 className='font-semibold text-base leading-none'>
            {t("stats.heroes.allTitle")}
          </h3>
          <p className='mt-1.5 text-muted-foreground text-xs'>
            {t("stats.heroes.allDescription", { count: heroes.length })}
          </p>
        </div>
        <div className='overflow-x-auto'>
          <div className='min-w-[860px]'>
            <div
              className={cn(
                GRID,
                "border-border/50 border-y px-6 py-2 font-semibold text-[10px] text-muted-foreground/70 uppercase tracking-[0.1em]",
              )}>
              <span>{t("stats.heroes.hero")}</span>
              {columns.map((column) => (
                // A real button, so sorting is reachable by keyboard.
                <button
                  aria-pressed={sortKey === column.key}
                  className={cn(
                    "flex select-none items-center gap-1 uppercase tracking-[0.1em] transition-colors hover:text-foreground",
                    sortKey === column.key && "text-foreground",
                  )}
                  key={column.key}
                  onClick={() => setSortKey(column.key)}
                  type='button'>
                  {column.label}
                  {sortKey === column.key && (
                    <ArrowDown aria-hidden className='h-3 w-3' />
                  )}
                </button>
              ))}
              <span>{t("stats.heroes.lastPlayed")}</span>
            </div>
            {sorted.map((hero) => {
              const info = heroesById.get(hero.heroId);
              const isActive = hero.heroId === activeHeroId;
              const good = hero.winrate >= careerWinrate;
              return (
                <button
                  aria-pressed={isActive}
                  className={cn(
                    GRID,
                    "w-full cursor-pointer border-border/50 border-t px-6 py-2.5 text-left transition-colors first-of-type:border-t-0 hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none",
                    isActive && "bg-primary/[0.05]",
                  )}
                  key={hero.heroId}
                  onClick={() => setSelectedHeroId(hero.heroId)}
                  type='button'>
                  <span className='flex min-w-0 items-center gap-3'>
                    <HeroAvatar
                      className={cn(
                        "h-9 w-9",
                        HERO_TILE_CLASS,
                        isActive && "border-primary/50",
                      )}
                      hero={info}
                      heroId={hero.heroId}
                    />
                    <span className='truncate font-semibold text-[13.5px]'>
                      {info?.name ?? `#${hero.heroId}`}
                    </span>
                  </span>
                  <span className='flex items-center gap-2.5'>
                    <span className='w-8 font-mono font-semibold text-[13px] tabular-nums'>
                      {hero.matches}
                    </span>
                    <span className='h-1.5 max-w-[150px] flex-1 overflow-hidden rounded-full bg-foreground/[0.06]'>
                      <span
                        className='block h-full rounded-full'
                        style={{
                          width: `${Math.max(3, (hero.matches / mostGames) * 100)}%`,
                          background:
                            "linear-gradient(90deg, color-mix(in srgb, hsl(var(--primary)) 25%, transparent), hsl(var(--primary)))",
                        }}
                      />
                    </span>
                  </span>
                  <span>
                    <span
                      className='rounded-full px-2 py-0.5 font-mono font-semibold text-xs'
                      style={{
                        color: good ? WIN_COLOR : LOSS_COLOR,
                        backgroundColor: tint(
                          good ? WIN_COLOR : LOSS_COLOR,
                          11,
                        ),
                      }}>
                      {formatPercent(hero.winrate, 0)}
                    </span>
                  </span>
                  <span className='font-mono text-[13px] tabular-nums'>
                    {formatDecimal(hero.kda, 1)}
                  </span>
                  <span className='font-mono text-[13px] tabular-nums'>
                    {formatCompact(hero.soulsPerMin)}
                  </span>
                  <span className='font-mono text-[13px] tabular-nums'>
                    {formatPercent(hero.accuracy, 0)}
                  </span>
                  <span className='truncate text-muted-foreground text-xs'>
                    {hero.lastPlayed > 0
                      ? formatDistanceToNow(hero.lastPlayed * 1000, {
                          addSuffix: true,
                        })
                      : "-"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </Card>
    </div>
  );
};
