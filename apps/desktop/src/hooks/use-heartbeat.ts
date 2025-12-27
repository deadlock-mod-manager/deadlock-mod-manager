import { useEffect, useRef } from "react";
import { sendHeartbeat } from "@/lib/api";
import logger from "@/lib/logger";
import { useAuth } from "./use-auth";

const HEARTBEAT_INTERVAL_MS = 60 * 1000;

export function useHeartbeat(): void {
  const { isAuthenticated } = useAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const doHeartbeat = async () => {
      try {
        await sendHeartbeat();
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
  }, [isAuthenticated]);
}
