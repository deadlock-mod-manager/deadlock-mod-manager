import { ScrollArea } from "@deadlock-mods/ui/components/scroll-area";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import { MatchDetailView } from "@/components/stats/match-detail-view";
import type { DeadlockHero } from "@/lib/deadlock-api";
import type { MatchHistoryEntry } from "@/lib/stats/api";
import { isWin } from "@/lib/stats/derive";
import { formatCompact, formatDateTime } from "@/lib/stats/format";
import { cn } from "@/lib/utils";

const MATCH_LIST_COUNT = 30;

interface PlayerMatchExplorerProps {
  accountId: number;
  matches: MatchHistoryEntry[];
  selectedMatchId: number | null;
  heroesById: Map<number, DeadlockHero>;
  onSelectMatch: (matchId: number) => void;
}

export const PlayerMatchExplorer = ({
  accountId,
  matches,
  selectedMatchId,
  heroesById,
  onSelectMatch,
}: PlayerMatchExplorerProps) => {
  const { t, i18n } = useTranslation();
  const recent = useMemo(
    () =>
      [...matches]
        .sort((a, b) => b.start_time - a.start_time)
        .slice(0, MATCH_LIST_COUNT),
    [matches],
  );
  const selected =
    recent.find((match) => match.match_id === selectedMatchId) ??
    recent[0] ??
    null;
  if (!selected) {
    return (
      <div className='flex min-h-72 items-center justify-center p-6 text-muted-foreground text-sm'>
        {t("stats.player.noMatchHistory")}
      </div>
    );
  }

  return (
    <div className='grid min-h-0 md:h-full md:grid-cols-[17rem_minmax(0,1fr)]'>
      <aside className='min-h-0 border-b md:border-r md:border-b-0'>
        <div className='flex h-11 items-center justify-between border-b px-3'>
          <span className='font-semibold text-xs'>
            {t("stats.player.matchHistory")}
          </span>
          <span className='text-muted-foreground text-xs tabular-nums'>
            {t("stats.player.lastN", { count: recent.length })}
          </span>
        </div>
        <ScrollArea className='h-52 md:h-[calc(100%-2.75rem)]'>
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
        />
      </ScrollArea>
    </div>
  );
};
