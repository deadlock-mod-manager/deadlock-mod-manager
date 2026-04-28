import type { PresenceBuildConfig } from "@deadlock-mods/deadlock-discord-presence";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";

export const GamePresenceRenderer = () => {
  const gamePresenceEnabled = usePersistedStore((s) => s.gamePresenceEnabled);
  const gamePresenceTextTemplates = usePersistedStore(
    (s) => s.gamePresenceTextTemplates,
  );
  const gamePresenceHeroOverrides = usePersistedStore(
    (s) => s.gamePresenceHeroOverrides,
  );
  const watcherActiveRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const syncWatcher = async () => {
      const stopWatcher = async (reason: string) => {
        await invoke("stop_game_presence_watcher");
        logger.info(reason);
        watcherActiveRef.current = false;
      };

      if (watcherActiveRef.current) {
        await stopWatcher("Game presence watcher stopped");
      }

      if (!gamePresenceEnabled || cancelled) {
        return;
      }

      const presenceConfig: PresenceBuildConfig = {
        templates: gamePresenceTextTemplates,
        heroOverrides: gamePresenceHeroOverrides,
      };

      await invoke("start_game_presence_watcher", { presenceConfig });
      if (!cancelled) {
        logger.info("Game presence watcher started");
        watcherActiveRef.current = true;
      }
    };

    syncWatcher().catch((error) => {
      if (gamePresenceEnabled) {
        logger.withError(error).warn("Failed to start game presence watcher");
      } else {
        logger.withError(error).warn("Failed to stop game presence watcher");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    gamePresenceEnabled,
    gamePresenceTextTemplates,
    gamePresenceHeroOverrides,
  ]);

  useEffect(() => {
    return () => {
      if (!watcherActiveRef.current) {
        return;
      }

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
  }, []);

  return null;
};
