import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";

export const useForgeBridge = () => {
  const forgeInstallEnabled = usePersistedStore(
    (state) => state.forgeInstallEnabled,
  );

  useEffect(() => {
    if (!forgeInstallEnabled) {
      invoke("stop_forge_bridge").catch((error) => {
        logger.withError(error).warn("Failed to stop forge bridge");
      });
      return;
    }

    invoke<number>("start_forge_bridge")
      .then((port) => {
        logger.withMetadata({ port }).info("Forge bridge listening");
      })
      .catch((error) => {
        logger.withError(error).error("Failed to start forge bridge");
      });
  }, [forgeInstallEnabled]);
};
