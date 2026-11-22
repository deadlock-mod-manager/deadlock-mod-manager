import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";

import logger from "@/lib/logger";

const WATCH_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

export const useMapConnectCode = () => {
  const [connectCode, setConnectCode] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [watching, setWatching] = useState(false);
  const unlistenRef = useRef<(() => void) | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopWatching = useCallback(async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }
    setWatching(false);
    try {
      await invoke("stop_watching_console_log");
    } catch (error) {
      logger.withError(error).error("Failed to stop console log watcher");
    }
  }, []);

  const startWatching = useCallback(async () => {
    setConnectCode(null);
    setWatching(true);

    try {
      unlistenRef.current = await listen<string>(
        "map-connect-code",
        (event) => {
          logger
            .withMetadata({ code: event.payload })
            .info("Received map connect code");
          setConnectCode(event.payload);
          setDialogOpen(true);
          setWatching(false);
          if (unlistenRef.current) {
            unlistenRef.current();
            unlistenRef.current = null;
          }
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
        },
      );

      await invoke("watch_console_log");

      timeoutRef.current = setTimeout(() => {
        logger.info("Console log watcher timed out");
        stopWatching();
      }, WATCH_TIMEOUT_MS);
    } catch (error) {
      logger.withError(error).error("Failed to start console log watcher");
      setWatching(false);
    }
  }, [stopWatching]);

  const handleDialogClose = useCallback(
    (open: boolean) => {
      setDialogOpen(open);
      if (!open) {
        stopWatching();
      }
    },
    [stopWatching],
  );

  useEffect(() => {
    return () => {
      stopWatching();
    };
  }, [stopWatching]);

  return {
    connectCode,
    dialogOpen,
    watching,
    startWatching,
    stopWatching,
    handleDialogClose,
  };
};
