import { useEffect, useRef } from "react";
import { useLiveBridge } from "@/hooks/use-live-bridge";
import { useGameRunning } from "@/hooks/use-mod-health";

/**
 * Keeps the live bridge in step with the game. The bridge carries a copy of the
 * game's top-bar team layout, so after a patch it would hold the old one in
 * place of the new; it is rebuilt as soon as the game is closed. One attempt
 * per outdated state, so a failure does not loop.
 */
export const LiveBridgeRenderer = () => {
  const { status, isUpdating, update } = useLiveBridge();
  const gameRunning = useGameRunning();
  const attempted = useRef(false);
  const isOutdated = status === "outdated";

  useEffect(() => {
    if (!isOutdated) {
      attempted.current = false;
      return;
    }
    if (gameRunning || attempted.current || isUpdating) return;
    attempted.current = true;
    update.mutate();
  }, [isOutdated, gameRunning, isUpdating, update]);

  return null;
};
