import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { FormChart } from "@/components/stats/form-chart";
import { InsightList } from "@/components/stats/insight-list";
import { RecentMatches } from "@/components/stats/recent-matches";
import { ScoreChart } from "@/components/stats/score-chart";
import { SessionChart } from "@/components/stats/session-chart";
import { StatTile } from "@/components/stats/stat-tile";
import type { DeadlockHero } from "@/lib/deadlock-api";
import type { MatchHistoryEntry, MmrHistoryEntry } from "@/lib/stats/api";
import {
  chronological,
  type Insight,
  streaks,
  summarize,
} from "@/lib/stats/derive";
import {
  formatCompact,
  formatDecimal,
  formatPercent,
  formatSignedPercent,
} from "@/lib/stats/format";

const RECENT_WINDOW = 30;
const THIRTY_DAYS_S = 30 * 24 * 60 * 60;

interface OverviewTabProps {
  matches: MatchHistoryEntry[];
  mmrHistory: MmrHistoryEntry[];
  insights: Insight[];
  heroesById: Map<number, DeadlockHero>;
}

export const OverviewTab = ({
  matches,
  mmrHistory,
  insights,
  heroesById,
}: OverviewTabProps) => {
  const { t } = useTranslation();

  const stats = useMemo(() => {
    const ordered = chronological(matches);
    const cutoff = Date.now() / 1000 - THIRTY_DAYS_S;
    return {
      career: summarize(ordered),
      recent: summarize(ordered.slice(-RECENT_WINDOW)),
      lastThirtyDays: ordered.filter((match) => match.start_time >= cutoff)
        .length,
      streak: streaks(ordered),
    };
  }, [matches]);

  const winrateDelta = stats.recent.winrate - stats.career.winrate;

  return (
    <div className='flex flex-col gap-4 pb-8'>
      <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'>
        <StatTile
          delta={{
            text: formatSignedPercent(winrateDelta, 1),
            isGood: winrateDelta >= 0,
            caption: t("stats.tiles.vsCareer"),
          }}
          label={t("stats.tiles.winrate", { count: RECENT_WINDOW })}
          value={formatPercent(stats.recent.winrate)}
        />
        <StatTile
          hint={t("stats.tiles.kdaHint", {
            kills: formatDecimal(stats.recent.kills, 1),
            deaths: formatDecimal(stats.recent.deaths, 1),
            assists: formatDecimal(stats.recent.assists, 1),
          })}
          label={t("stats.tiles.kda")}
          value={formatDecimal(stats.recent.kda)}
        />
        <StatTile
          hint={t("stats.tiles.soulsHint")}
          label={t("stats.tiles.souls")}
          value={formatCompact(stats.recent.soulsPerMin)}
        />
        <StatTile
          hint={t("stats.tiles.matchesHint", {
            total: stats.career.matches,
          })}
          label={t("stats.tiles.matches")}
          value={String(stats.lastThirtyDays)}
        />
        <StatTile
          hint={t("stats.tiles.streakHint", {
            wins: stats.streak.longestWin,
            losses: stats.streak.longestLoss,
          })}
          label={t("stats.tiles.streak")}
          value={
            stats.streak.current === 0
              ? "-"
              : t(
                  stats.streak.current > 0
                    ? "stats.tiles.streakWins"
                    : "stats.tiles.streakLosses",
                  { count: Math.abs(stats.streak.current) },
                )
          }
        />
      </div>

      <InsightList heroesById={heroesById} insights={insights} />

      <FormChart matches={matches} />

      <div className='grid gap-4 lg:grid-cols-2'>
        <SessionChart matches={matches} />
        <ScoreChart history={mmrHistory} />
      </div>

      <RecentMatches heroesById={heroesById} matches={matches} />
    </div>
  );
};
