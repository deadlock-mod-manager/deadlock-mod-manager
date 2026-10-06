import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEffect } from "react";
import logger from "@/lib/logger";
import {
  ADDONS_CHANGED_EVENT,
  notifyRemovedMods,
} from "@/lib/mods/missing-vpks";
import { usePersistedStore } from "@/lib/store";

/**
 * Keeps the library in step with VPKs the user deletes while DMM is open. The
 * backend watches the addons folders; each burst of changes reconciles every
 * profile, which removes mods with no files left and flags partly deleted ones.
 */
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

  // A changed game path moves the addons folders. On startup the backend may
  // not know the path yet; the app bootstrap starts the watch once it does.
  useEffect(() => {
    if (!gamePath) return;
    invoke("watch_addons_vpks").catch((error) => {
      logger.withError(error).debug("Addon VPK watcher not started yet");
    });
  }, [gamePath]);
};
