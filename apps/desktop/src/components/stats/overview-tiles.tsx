import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { StatTile } from "@/components/stats/stat-tile";
import type { MatchHistoryEntry } from "@/lib/stats/api";
import { chronological, streaks, summarize } from "@/lib/stats/derive";
import {
  formatCompact,
  formatDecimal,
  formatPercent,
  formatSignedPercent,
} from "@/lib/stats/format";

const RECENT_WINDOW = 30;
const THIRTY_DAYS_S = 30 * 24 * 60 * 60;

interface OverviewTilesProps {
  matches: MatchHistoryEntry[];
}

export const OverviewTiles = ({ matches }: OverviewTilesProps) => {
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
    <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'>
      <StatTile
        delta={{
          text: formatSignedPercent(winrateDelta, 1),
          isGood: winrateDelta >= 0,
          caption: t("stats.tiles.vsCareer"),
        }}
        label={t("stats.tiles.winrate", { count: stats.recent.matches })}
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
        hint={t("stats.tiles.soulsHint", { count: stats.recent.matches })}
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
  );
};
