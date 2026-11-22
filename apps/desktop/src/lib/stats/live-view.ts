import type { GamePhase } from "@/types/generated/GamePhase";
import type { LiveMatchStatus } from "@/types/generated/LiveMatchStatus";
import type { LiveScoreboard } from "@/types/generated/LiveScoreboard";

export const BRIDGE_STALE_MS = 45_000;

const isRecentReport = (reportedAt: number | null, now: number): boolean =>
  reportedAt !== null && now - reportedAt < BRIDGE_STALE_MS;

export interface LiveBoard {
  phase: GamePhase | null;
  board: LiveScoreboard | null;
  matchId: string | null;
}

export const liveBoard = (
  status: LiveMatchStatus | undefined,
  gameRunning: boolean,
  now: number,
): LiveBoard => {
  if (gameRunning && !status?.current && status?.lastMatch) {
    return {
      phase: "ended",
      board: status.lastMatch.scoreboard,
      matchId: status.lastMatch.matchId,
    };
  }
  const phase = gameRunning ? (status?.current?.phase ?? null) : null;
  const scoreboard = status?.scoreboard ?? null;
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
