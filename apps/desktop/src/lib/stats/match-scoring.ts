import type {
  MatchHistoryEntry,
  MatchMetadata,
  MatchMetadataPlayer,
} from "@/lib/stats/api";
import { matchOutcome } from "@/lib/stats/derive";

export type MatchScoring =
  | { status: "win" | "loss" }
  | { status: "abandoned"; time: number }
  | {
      status: "notScored";
      teammates: Array<{ accountId: number; heroId: number; time: number }>;
    };

export const matchScoring = (
  match: MatchMetadata["match_info"],
  me: MatchMetadataPlayer,
  history: MatchHistoryEntry | undefined,
): MatchScoring => {
  const time = Math.max(
    me.abandon_match_time_s ?? 0,
    history?.abandoned_time_s ?? 0,
  );
  if (time > 0) return { status: "abandoned", time };

  const status = matchOutcome({
    player_match_outcome:
      history?.player_match_outcome ?? me.player_match_outcome,
    player_team: me.team,
    match_result: match.winning_team,
  });
  if (status !== "notScored") return { status };

  // These are recorded departures, not a server-provided reason for the non-score.
  const teammates = match.players
    .flatMap((player) => {
      const time = player.abandon_match_time_s ?? 0;
      return player.account_id !== me.account_id &&
        player.team === me.team &&
        time > 0
        ? [{ accountId: player.account_id, heroId: player.hero_id, time }]
        : [];
    })
    .sort((a, b) => a.time - b.time);
  return { status, teammates };
};
