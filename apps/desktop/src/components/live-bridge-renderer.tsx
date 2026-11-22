import { useEffect, useRef } from "react";
import { useLiveBridge } from "@/hooks/use-live-bridge";
import { useGameRunning } from "@/hooks/use-mod-health";

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
