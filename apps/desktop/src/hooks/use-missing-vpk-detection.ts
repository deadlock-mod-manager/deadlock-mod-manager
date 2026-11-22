import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEffect } from "react";
import logger from "@/lib/logger";
import {
  ADDONS_CHANGED_EVENT,
  notifyRemovedMods,
} from "@/lib/mods/missing-vpks";
import { usePersistedStore } from "@/lib/store";

export const useMissingVpkDetection = () => {
  const gamePath = usePersistedStore((state) => state.gamePath);

  useEffect(() => {
    let disposed = false;
    let unlisten: UnlistenFn | undefined;
    void listen(ADDONS_CHANGED_EVENT, () => {
      usePersistedStore
        .getState()
        .restoreModsFromManifest()
        .then(notifyRemovedMods)
        .catch((error) => {
          logger
            .withError(error)
            .warn("Failed to reconcile mods after addon VPKs changed");
        });
    }).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!gamePath) return;
    invoke("watch_addons_vpks").catch((error) => {
      logger.withError(error).debug("Addon VPK watcher not started yet");
    });
  }, [gamePath]);
};
