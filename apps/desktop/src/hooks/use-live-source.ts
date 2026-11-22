import { useMemo } from "react";
import { useLiveBridge } from "@/hooks/use-live-bridge";
import { useLiveHeroBenchmark, useLiveLobby } from "@/hooks/use-live-lobby";
import { useLiveMatchDetection, useSoulsTrail } from "@/hooks/use-live-match";
import { useGameRunning } from "@/hooks/use-mod-health";
import type { DeadlockHero } from "@/lib/deadlock-api";
import type {
  MatchHistoryEntry,
  PerformanceCurvePoint,
  PlayerRank,
} from "@/lib/stats/api";
import type { Grade } from "@/lib/stats/live-grades";
import type { LiveLobby } from "@/lib/stats/live-lobby";
import { type SoulsPoint, useLiveSession } from "@/lib/stats/live-session";
import { liveBoard } from "@/lib/stats/live-view";
import type { StatsScope } from "@/lib/stats/scope";
import type { LiveMatchStatus } from "@/types/generated/LiveMatchStatus";
import type { LiveScoreboardPlayer } from "@/types/generated/LiveScoreboardPlayer";

export interface LiveSource {
  status: LiveMatchStatus | undefined;
  gameRunning: boolean;
  bridge: {
    needsSetup: boolean;
    inLibrary: boolean;
    isInstalling: boolean;
    install: () => void;
  };
  lobby: LiveLobby;
  curve: PerformanceCurvePoint[];
  benchmarkPending: boolean;
  benchmarkFailed: boolean;
  trail: SoulsPoint[];
  matches: MatchHistoryEntry[];
  finalGrades: Record<string, Grade>;
  yourAccountId: number | null;
  badge: number | undefined;
  result: "win" | "loss" | null;
  rememberGrade: ((matchId: string, grade: Grade) => void) | null;
}

const NO_CURVE: PerformanceCurvePoint[] = [];

export interface LiveScoreboardYou {
  accountId: number | null;
  rank: PlayerRank | null;
  matches: MatchHistoryEntry[];
}

export const useRealLiveSource = ({
  you,
  scope,
  heroFor,
}: {
  you: LiveScoreboardYou;
  scope: StatsScope;
  heroFor: (player: LiveScoreboardPlayer) => DeadlockHero | undefined;
}): LiveSource => {
  const status = useLiveMatchDetection(true).data;
  const bridge = useLiveBridge();
  const gameRunning = useGameRunning();
  const { phase, board, matchId } = liveBoard(status, gameRunning, Date.now());

  const lobbyAccounts = useMemo(
    () =>
      [...(board?.friendly ?? []), ...(board?.enemy ?? [])].flatMap((player) =>
        player.accountId === null ? [] : [player.accountId],
      ),
    [board?.friendly, board?.enemy],
  );
  const localPlayer = board?.friendly.find((player) => player.isLocal);
  const localHeroId = (localPlayer && heroFor(localPlayer)?.id) ?? null;
  const yourAccountId = you.accountId ?? localPlayer?.accountId ?? null;
  const lobby = useLiveLobby({
    accountIds: lobbyAccounts,
    yourAccountId,
    yourHeroId: localHeroId,
  });
  const badge =
    (yourAccountId === null ? undefined : lobby.ranks.get(yourAccountId)) ??
    you.rank?.badge;
  const benchmark = useLiveHeroBenchmark(localHeroId, badge, scope);
  const clockSeconds = board?.clockSeconds ?? null;
  const trail = useSoulsTrail(
    matchId,
    phase === "inProgress" && clockSeconds !== null ? clockSeconds / 60 : null,
    localPlayer?.souls ?? null,
  );
  const finalGrades = useLiveSession((state) => state.finalGrades);
  const rememberGrade = useLiveSession((state) => state.rememberGrade);

  return {
    status,
    gameRunning,
    bridge: {
      needsSetup: bridge.status === "notInstalled",
      inLibrary: bridge.inLibrary,
      isInstalling: bridge.install.isPending,
      install: () => bridge.install.mutate(),
    },
    lobby,
    curve: benchmark.data?.data ?? NO_CURVE,
    benchmarkPending: benchmark.isPending,
    benchmarkFailed: benchmark.isError,
    trail,
    matches: you.matches,
    finalGrades,
    yourAccountId,
    badge,
    result: null,
    rememberGrade,
  };
};
