import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";

const GamePresenceRenderer = () => {
  const gamePresenceEnabled = usePersistedStore((s) => s.gamePresenceEnabled);
  const watcherActiveRef = useRef(false);

  useEffect(() => {
    if (!gamePresenceEnabled) {
      if (watcherActiveRef.current) {
        invoke("stop_game_presence_watcher")
          .then(() => {
            logger.info("Game presence watcher stopped");
            watcherActiveRef.current = false;
          })
          .catch((error) => {
            logger
              .withError(error)
              .warn("Failed to stop game presence watcher");
          });
      }
      return;
    }

    invoke("start_game_presence_watcher")
      .then(() => {
        logger.info("Game presence watcher started");
        watcherActiveRef.current = true;
      })
      .catch((error) => {
        logger.withError(error).warn("Failed to start game presence watcher");
      });

    return () => {
      invoke("stop_game_presence_watcher")
        .then(() => {
          watcherActiveRef.current = false;
        })
        .catch((error) => {
          logger
            .withError(error)
            .warn("Failed to stop game presence watcher on cleanup");
        });
    };
  }, [gamePresenceEnabled]);

  return null;
};

export default GamePresenceRenderer;
