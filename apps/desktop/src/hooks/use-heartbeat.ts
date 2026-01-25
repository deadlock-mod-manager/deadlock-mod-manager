import { useEffect, useRef } from "react";
import { sendHeartbeat } from "@/lib/api";
import { HEARTBEAT_INTERVAL_SECONDS } from "@/lib/config";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { ModStatus } from "@/types/mods";
import { useAuth } from "./use-auth";
import { useFeatureFlag } from "./use-feature-flags";

const HEARTBEAT_INTERVAL_MS = HEARTBEAT_INTERVAL_SECONDS * 1000;

const getActiveModIds = (): string[] => {
  const { localMods } = usePersistedStore.getState();
  return localMods
    .filter(
      (mod) =>
        mod.status === ModStatus.Installed &&
        mod.installedVpks &&
        mod.installedVpks.length > 0,
    )
    .map((mod) => mod.remoteId);
};

export function useHeartbeat(): void {
  const { isAuthenticated } = useAuth();
  const { isEnabled: isFriendSystemEnabled } = useFeatureFlag("friend-system");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !isFriendSystemEnabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const doHeartbeat = async () => {
      try {
        const modIds = getActiveModIds();
        await sendHeartbeat(modIds);
      } catch (error) {
        logger.withError(error).warn("Failed to send heartbeat");
      }
    };

    doHeartbeat();

    intervalRef.current = setInterval(doHeartbeat, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isAuthenticated, isFriendSystemEnabled]);
}
