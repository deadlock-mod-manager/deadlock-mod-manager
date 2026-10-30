import type { GamePhase } from "@/types/generated/GamePhase";
import type { LiveMatchStatus } from "@/types/generated/LiveMatchStatus";
import type { LiveScoreboard } from "@/types/generated/LiveScoreboard";

/** The bridge repeats an unchanged board every 20 seconds, so this is overdue. */
export const BRIDGE_STALE_MS = 45_000;

/**
 * Whether the bridge reported recently. Bot and practice matches log no lobby
 * line, so this is what tells them apart from a finished match.
 */
const isRecentReport = (reportedAt: number | null, now: number): boolean =>
  reportedAt !== null && now - reportedAt < BRIDGE_STALE_MS;

export interface LiveBoard {
  /** The lobby's phase, or `null` with the game closed or no lobby logged. */
  phase: GamePhase | null;
  /** The bridge's board, when it describes the match on screen. */
  board: LiveScoreboard | null;
  matchId: string | null;
}

export const liveBoard = (
  status: LiveMatchStatus | undefined,
  gameRunning: boolean,
  now: number,
): LiveBoard => {
  // console.log outlives the game, so with Deadlock closed nothing in it is
  // current. Only a lobby line marks a real match; the hideout runs the same
  // top bar without one.
  const phase = gameRunning ? (status?.current?.phase ?? null) : null;
  const scoreboard = status?.scoreboard ?? null;
  // In the match the bridge reports throughout, so a quiet board is from a
  // session that never wrote the log. Before it, the top bar may not exist yet.
  const shown =
    phase === "pregame" ||
    phase === "ended" ||
    (phase === "inProgress" &&
      isRecentReport(scoreboard?.reportedAt ?? null, now));
  return {
    phase,
    board: shown ? scoreboard : null,
    matchId: status?.current?.matchId ?? null,
  };
};

export type LiveViewState =
  | { kind: "checking" }
  | { kind: "condebug" }
  | { kind: "scouting"; board: LiveScoreboard }
  | {
      kind: "match";
      board: LiveScoreboard;
      matchId: string | null;
      isOver: boolean;
    }
  | { kind: "needsSetup" }
  | { kind: "closed" }
  | { kind: "queued"; since: number }
  // A match without a board: the game was started before the bridge was
  // installed, or the top bar has not appeared yet.
  | { kind: "pregameLoading" }
  | { kind: "matchOverNoBoard" }
  | { kind: "noBridge" }
  | { kind: "waiting" };

export const liveViewState = ({
  status,
  gameRunning,
  needsSetup,
  now,
}: {
  status: LiveMatchStatus | undefined;
  gameRunning: boolean;
  needsSetup: boolean;
  now: number;
}): LiveViewState => {
  if (!status) return { kind: "checking" };
  // console.log only exists with -condebug, and everything here is read from it.
  if (!status.consoleLogAvailable) return { kind: "condebug" };

  const { phase, board, matchId } = liveBoard(status, gameRunning, now);
  if (board && phase === "pregame") return { kind: "scouting", board };
  if (board && (phase === "inProgress" || phase === "ended")) {
    return {
      kind: "match",
      board,
      matchId,
      isOver: phase === "ended",
    };
  }
  if (needsSetup) return { kind: "needsSetup" };
  if (!gameRunning) return { kind: "closed" };
  if (!status.current) {
    return status.queuedSince === null
      ? { kind: "waiting" }
      : { kind: "queued", since: status.queuedSince };
  }
  if (phase === "pregame") return { kind: "pregameLoading" };
  return phase === "inProgress"
    ? { kind: "noBridge" }
    : { kind: "matchOverNoBoard" };
};
