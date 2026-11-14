import { useTranslation } from "react-i18next";
import type { DeadlockHero } from "@/lib/deadlock-api";
import type { SteamProfile } from "@/lib/stats/api";
import { formatClock } from "@/lib/stats/format";
import type { MatchScoring } from "@/lib/stats/match-scoring";

interface MatchScoringNoteProps {
  scoring: MatchScoring;
  profiles: Map<number, SteamProfile>;
  heroesById: Map<number, DeadlockHero>;
}

export const MatchScoringNote = ({
  scoring,
  profiles,
  heroesById,
}: MatchScoringNoteProps) => {
  const { t } = useTranslation();
  if (scoring.status === "abandoned") {
    return (
      <p className='mt-2 text-xs text-muted-foreground'>
        {t("stats.match.abandonedAt", { time: formatClock(scoring.time) })}
      </p>
    );
  }
  if (scoring.status !== "notScored") return null;
  if (scoring.teammates.length === 0) {
    return (
      <p className='mt-2 text-xs text-muted-foreground'>
        {t("stats.match.unscoredReasonUnavailable")}
      </p>
    );
  }
  return (
    <div className='mt-2 text-xs text-muted-foreground'>
      <p>{t("stats.match.unscoredTeammates")}</p>
      <ul className='mt-1 space-y-0.5'>
        {scoring.teammates.map((player) => {
          const hero =
            heroesById.get(player.heroId)?.name ?? `#${player.heroId}`;
          const name = profiles.get(player.accountId)?.personaname;
          return (
            <li key={player.accountId}>
              {t("stats.match.teammateAbandonedAt", {
                player: name ? `${name} (${hero})` : hero,
                time: formatClock(player.time),
              })}
            </li>
          );
        })}
      </ul>
    </div>
  );
};
