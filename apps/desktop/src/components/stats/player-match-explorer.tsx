import { ScrollArea } from "@deadlock-mods/ui/components/scroll-area";
import { X } from "@deadlock-mods/ui/icons";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import { MatchDetailView } from "@/components/stats/match-detail-view";
import type { DeadlockHero } from "@/lib/deadlock-api";
import type { MatchHistoryEntry } from "@/lib/stats/api";
import { isWin, summarize } from "@/lib/stats/derive";
import {
  formatCompact,
  formatDateTime,
  formatDecimal,
  formatPercent,
} from "@/lib/stats/format";
import { cn } from "@/lib/utils";

const MATCH_LIST_COUNT = 30;

interface PlayerMatchExplorerProps {
  accountId: number;
  matches: MatchHistoryEntry[];
  selectedMatchId: number | null;
  /** Narrows the list to one hero; null shows every match. */
  heroFilter: number | null;
  heroesById: Map<number, DeadlockHero>;
  onSelectMatch: (matchId: number) => void;
  onClearHeroFilter: () => void;
  onSelectHero: (heroId: number) => void;
}

export const PlayerMatchExplorer = ({
  accountId,
  matches,
  selectedMatchId,
  heroFilter,
  heroesById,
  onSelectMatch,
  onClearHeroFilter,
  onSelectHero,
}: PlayerMatchExplorerProps) => {
  const { t, i18n } = useTranslation();
  const recent = useMemo(
    () =>
      [...matches]
        .filter((match) => heroFilter === null || match.hero_id === heroFilter)
        .sort((a, b) => b.start_time - a.start_time)
        .slice(0, MATCH_LIST_COUNT),
    [matches, heroFilter],
  );
  // How the filtered run actually went, so the list has a headline rather than
  // leaving the reader to add up thirty rows.
  const summary = useMemo(() => summarize(recent), [recent]);
  const filteredHero =
    heroFilter === null ? undefined : heroesById.get(heroFilter);

  const selected =
    recent.find((match) => match.match_id === selectedMatchId) ??
    recent[0] ??
    null;
  if (!selected) {
    return (
      <div className='flex min-h-72 flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground text-sm'>
        {heroFilter === null
          ? t("stats.player.noMatchHistory")
          : t("stats.player.noHeroMatches", {
              hero: filteredHero?.name ?? `#${heroFilter}`,
            })}
        {heroFilter !== null && (
          <button
            className='rounded-md border px-2.5 py-1.5 font-medium text-foreground text-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            onClick={onClearHeroFilter}
            type='button'>
            {t("stats.player.showAllMatches")}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className='grid min-h-0 md:h-full md:grid-cols-[17rem_minmax(0,1fr)]'>
      <aside className='min-h-0 border-b md:border-r md:border-b-0'>
        <div className='flex h-11 items-center justify-between gap-2 border-b px-3'>
          {heroFilter === null ? (
            <>
              <span className='font-semibold text-xs'>
                {t("stats.player.matchHistory")}
              </span>
              <span className='text-muted-foreground text-xs tabular-nums'>
                {t("stats.player.lastN", { count: recent.length })}
              </span>
            </>
          ) : (
            <>
              <span className='flex min-w-0 items-center gap-1.5'>
                <HeroAvatar
                  className='h-5 w-5 shrink-0'
                  hero={filteredHero}
                  heroId={heroFilter}
                />
                <span className='truncate font-semibold text-xs'>
                  {filteredHero?.name ?? `#${heroFilter}`}
                </span>
              </span>
              <button
                aria-label={t("stats.player.showAllMatches")}
                className='-mr-1 shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                onClick={onClearHeroFilter}
                type='button'>
                <X className='h-3.5 w-3.5' />
              </button>
            </>
          )}
        </div>

        {heroFilter !== null && (
          <p className='border-b px-3 py-2 text-muted-foreground text-[11px] tabular-nums'>
            {t("stats.player.heroRunSummary", {
              count: summary.matches,
              winrate: formatPercent(summary.winrate, 0),
              kda: formatDecimal(summary.kda),
            })}
          </p>
        )}

        <ScrollArea
          className={cn(
            "h-52",
            heroFilter === null
              ? "md:h-[calc(100%-2.75rem)]"
              : "md:h-[calc(100%-5.25rem)]",
          )}>
          <div className='p-1.5'>
            {recent.map((match) => {
              const matchHero = heroesById.get(match.hero_id);
              const matchWon = isWin(match);
              const isSelected = match.match_id === selected.match_id;
              return (
                <button
                  aria-current={isSelected ? "true" : undefined}
                  className={cn(
                    "grid w-full grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-transparent px-2 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isSelected && "border-border bg-accent",
                  )}
                  key={match.match_id}
                  onClick={() => onSelectMatch(match.match_id)}
                  type='button'>
                  <div
                    className={cn(
                      "rounded-md border-2",
                      matchWon
                        ? "border-emerald-500/60"
                        : "border-destructive/60",
                    )}>
                    <HeroAvatar
                      className='h-9 w-9'
                      hero={matchHero}
                      heroId={match.hero_id}
                    />
                  </div>
                  <div className='min-w-0'>
                    <div className='flex items-center gap-1.5'>
                      <span className='truncate font-medium text-xs'>
                        {matchHero?.name ?? `#${match.hero_id}`}
                      </span>
                      <span
                        className={cn(
                          "text-[10px]",
                          matchWon ? "text-emerald-500" : "text-destructive",
                        )}>
                        {matchWon ? t("stats.win") : t("stats.loss")}
                      </span>
                    </div>
                    <div className='truncate text-[10px] text-muted-foreground'>
                      {formatDateTime(match.start_time, i18n.language)}
                    </div>
                  </div>
                  <div className='text-right'>
                    <div className='font-medium text-xs tabular-nums'>
                      {match.player_kills}/{match.player_deaths}/
                      {match.player_assists}
                    </div>
                    <div className='text-[10px] text-muted-foreground tabular-nums'>
                      {formatCompact(match.net_worth)}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </aside>

      <ScrollArea className='h-auto md:h-full'>
        <MatchDetailView
          accountId={accountId}
          heroesById={heroesById}
          match={selected}
          onSelectHero={onSelectHero}
        />
      </ScrollArea>
    </div>
  );
};
