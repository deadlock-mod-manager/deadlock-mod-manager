import { toast } from "@deadlock-mods/ui/components/sonner";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { useTranslation } from "react-i18next";
import { useBisect } from "@/hooks/use-bisect";
import logger from "@/lib/logger";
import { STALE_TIME_POLL } from "@/lib/query-constants";
import { usePersistedStore } from "@/lib/store";
import { isCurrentBisectSession } from "@/lib/store/slices/bisect";
import { isGameRunning } from "@/lib/tauri-commands";
import { BisectBanner } from "./bisect-banner";
import { BisectExplainerDialog } from "./bisect-explainer-dialog";
import { BisectRecoveryBanner } from "./bisect-recovery-banner";
import { BisectResultDialog } from "./bisect-result-dialog";
import { BisectSetupDialog } from "./bisect-setup-dialog";

const GAME_POLL_MS = 2000;

/**
 * Follows the game through each round: launching moves a ready round to
 * playing, closing the game asks for an answer, and a crash answers for the
 * user. Everything lives in the persisted session, so a restart resumes here.
 */
const useRoundTracking = () => {
  const { t } = useTranslation();
  const session = usePersistedStore((state) => state.bisectSession);
  const updateSession = usePersistedStore((state) => state.updateBisectSession);
  const { run, isPending } = useBisect();
  const stage =
    session && isCurrentBisectSession(session) ? session.stage : undefined;
  const watching = stage === "ready" || stage === "playing";

  const { data: gameRunning } = useQuery({
    queryKey: ["is-game-running"],
    queryFn: isGameRunning,
    staleTime: STALE_TIME_POLL,
    refetchInterval: watching ? GAME_POLL_MS : false,
    enabled: watching,
  });

  useEffect(() => {
    if (gameRunning === undefined) return;
    if (stage === "ready" && gameRunning) updateSession({ stage: "playing" });
    if (stage === "playing" && !gameRunning) {
      updateSession({ stage: "judging" });
    }
  }, [gameRunning, stage, updateSession]);

  const crashDetected = session?.crashDetected ?? false;
  const round = session?.round;
  // One automatic answer per round: if it fails, the user is asked instead
  // of the step retrying in a loop.
  const autoAnsweredRound = useRef<number | null>(null);
  useEffect(() => {
    if (stage !== "judging" || !crashDetected || isPending) return;
    if (round === undefined || autoAnsweredRound.current === round) return;
    autoAnsweredRound.current = round;
    toast.info(t("bisect.toasts.crashCounted"));
    run({ type: "answer", outcome: "fail" });
  }, [crashDetected, isPending, round, run, stage, t]);

  return session;
};

export const BisectRenderer = () => {
  const session = useRoundTracking();
  const [resultHidden, setResultHidden] = useState(false);
  const showingResult = session?.stage === "result";

  // Each new result opens again, even after the last one was closed.
  useEffect(() => {
    if (showingResult) setResultHidden(false);
  }, [showingResult]);

  return (
    <>
      {session &&
        (isCurrentBisectSession(session) ? (
          // A bug here must never take the app down or strand the mods.
          <ErrorBoundary
            fallback={<BisectRecoveryBanner reason='error' />}
            onError={(error) =>
              logger.withError(error).error("Bisect banner failed")
            }>
            <BisectBanner
              onShowResult={() => setResultHidden(false)}
              session={session}
            />
            {showingResult && (
              <BisectResultDialog
                onHide={() => setResultHidden(true)}
                open={!resultHidden}
                session={session}
              />
            )}
          </ErrorBoundary>
        ) : (
          <BisectRecoveryBanner reason='outdated' />
        ))}
      <BisectSetupDialog />
      <BisectExplainerDialog />
    </>
  );
};
