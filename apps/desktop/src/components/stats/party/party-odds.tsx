import { Card } from "@deadlock-mods/ui/components/card";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { BadgeCheck, Dices } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import {
  INFO_COLOR,
  tint,
  WIN_COLOR,
  winrateColor,
} from "@/components/stats/chart-fx";
import { LineupLine } from "@/components/stats/party/lineup-line";
import { WinrateShift } from "@/components/stats/party/winrate-shift";
import type { DeadlockHero } from "@/lib/deadlock-api";
import { formatPercent } from "@/lib/stats/format";
import type { PartyOdds as Odds } from "@/lib/stats/party";

interface PartyOddsProps {
  players: number;
  odds: Odds;
  heroesById: Map<number, DeadlockHero>;
  isPending: boolean;
  isError: boolean;
  /** No single pick change raises the expected winrate any further. */
  isOptimal: boolean;
}

/** What the party can expect from queue, and its best and worst draw. */
export const PartyOdds = ({
  players,
  odds,
  heroesById,
  isPending,
  isError,
  isOptimal,
}: PartyOddsProps) => {
  const { t } = useTranslation();
  const rated = odds.lineups.filter((lineup) => lineup.stat);
  const best = rated[0];
  const worst = rated.at(-1);
  const badgeColor = odds.isEstimate ? INFO_COLOR : WIN_COLOR;

  const message = (() => {
    if (players < 2) return t("stats.party.odds.needPlayers");
    if (isPending) return null;
    if (isError) return t("stats.party.error");
    if (odds.expected === null) return t("stats.party.odds.noData");
    return t("stats.party.odds.note", { count: odds.lineups.length });
  })();

  return (
    <Card className='stats-surface flex flex-col gap-3.5 p-5 shadow-none'>
      <div className='flex items-center justify-between'>
        <span className='flex items-center gap-1.5 font-bold text-[10.5px] text-primary uppercase tracking-[0.12em]'>
          <Dices aria-hidden className='h-3.5 w-3.5' />
          {t("stats.party.odds.title")}
        </span>
        {odds.expected !== null && (
          <span
            className='rounded-full px-2 py-0.5 font-semibold text-[10.5px]'
            style={{ color: badgeColor, backgroundColor: tint(badgeColor, 12) }}
            title={
              odds.isEstimate ? t("stats.party.odds.estimateHint") : undefined
            }>
            {odds.isEstimate
              ? t("stats.party.odds.estimate")
              : t("stats.party.odds.exact")}
          </span>
        )}
      </div>
      {players >= 2 && isPending ? (
        <Skeleton className='h-[34px] w-28' />
      ) : (
        <span className='flex items-baseline gap-2.5'>
          <span
            className='font-bold font-mono text-[34px] leading-none transition-colors duration-200'
            style={
              odds.expected === null
                ? undefined
                : { color: winrateColor(odds.expected) }
            }>
            {odds.expected === null ? "–" : formatPercent(odds.expected)}
          </span>
          <WinrateShift expected={odds.expected} />
        </span>
      )}
      {message === null ? (
        <Skeleton className='h-4 w-56' />
      ) : (
        <p className='text-muted-foreground text-xs leading-relaxed'>
          {message}
        </p>
      )}
      {!isPending && isOptimal && odds.expected !== null && (
        <p
          className='flex items-center gap-1.5 font-medium text-xs'
          style={{ color: WIN_COLOR }}>
          <BadgeCheck aria-hidden className='h-3.5 w-3.5 shrink-0' />
          {t("stats.party.odds.optimal")}
        </p>
      )}
      {!isPending && best && worst && rated.length > 1 && (
        <>
          <LineupLine
            heroesById={heroesById}
            label={t("stats.party.odds.best")}
            lineup={best}
          />
          <LineupLine
            heroesById={heroesById}
            label={t("stats.party.odds.worst")}
            lineup={worst}
          />
        </>
      )}
    </Card>
  );
};
