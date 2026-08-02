import { Card } from "@deadlock-mods/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@deadlock-mods/ui/components/table";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BenchmarkChart } from "@/components/stats/benchmark-chart";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import { HeroScatter } from "@/components/stats/hero-scatter";
import type { DeadlockHero } from "@/lib/deadlock-api";
import type { BenchmarkMetric, HeroPerformance } from "@/lib/stats/derive";
import {
  formatCompact,
  formatDecimal,
  formatPercent,
} from "@/lib/stats/format";
import { cn } from "@/lib/utils";

type SortKey = "matches" | "winrate" | "kda" | "soulsPerMin" | "accuracy";

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

  const activeHeroId = selectedHeroId ?? sorted[0]?.heroId ?? null;
  const activeHero =
    activeHeroId === null ? undefined : heroesById.get(activeHeroId);
  const metrics = activeHeroId === null ? [] : benchmarkFor(activeHeroId);

  if (heroes.length === 0) {
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
      <div className='grid gap-4 xl:grid-cols-2'>
        <HeroScatter
          baseline={careerWinrate}
          heroes={heroes}
          heroesById={heroesById}
          onSelect={setSelectedHeroId}
        />
        {metrics.length > 0 && (
          <BenchmarkChart
            heroName={activeHero?.name ?? `#${activeHeroId}`}
            metrics={metrics}
          />
        )}
      </div>

      <Card className='shadow-none'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("stats.heroes.hero")}</TableHead>
              {columns.map((column) => (
                <TableHead
                  className={cn(
                    "cursor-pointer select-none text-right",
                    sortKey === column.key && "text-foreground",
                  )}
                  key={column.key}
                  onClick={() => setSortKey(column.key)}>
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((hero) => (
              <TableRow
                className={cn(
                  "cursor-pointer",
                  hero.heroId === activeHeroId && "bg-accent",
                )}
                key={hero.heroId}
                onClick={() => setSelectedHeroId(hero.heroId)}>
                <TableCell className='flex items-center gap-2 font-medium'>
                  <HeroAvatar
                    hero={heroesById.get(hero.heroId)}
                    heroId={hero.heroId}
                  />
                  {heroesById.get(hero.heroId)?.name ?? `#${hero.heroId}`}
                </TableCell>
                <TableCell className='text-right tabular-nums'>
                  {hero.matches}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    hero.winrate >= careerWinrate
                      ? "text-emerald-500"
                      : "text-destructive",
                  )}>
                  {formatPercent(hero.winrate, 0)}
                </TableCell>
                <TableCell className='text-right tabular-nums'>
                  {formatDecimal(hero.kda)}
                </TableCell>
                <TableCell className='text-right tabular-nums'>
                  {formatCompact(hero.soulsPerMin)}
                </TableCell>
                <TableCell className='text-right tabular-nums'>
                  {formatPercent(hero.accuracy, 0)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};
