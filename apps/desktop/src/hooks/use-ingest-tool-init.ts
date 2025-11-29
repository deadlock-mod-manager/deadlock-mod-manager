import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";

/**
 * Hook to initialize the ingest tool on app startup if enabled
 */
export const useIngestToolInit = () => {
  const ingestToolEnabled = usePersistedStore(
    (state) => state.ingestToolEnabled,
  );
  const hasInitialized = useRef(false);

  useEffect(() => {
    const initializeIngestTool = async () => {
      if (!ingestToolEnabled) {
        logger.debug("Ingest tool is disabled, skipping initialization");
        return;
      }

      if (hasInitialized.current) {
        return;
      }
      hasInitialized.current = true;

      try {
        logger.info("Initializing ingest tool on app startup");
        await invoke("initialize_ingest_tool");
        logger.info("Ingest tool initialized successfully");
      } catch (error) {
        logger.error("Failed to initialize ingest tool:", error);
      }
    };

    initializeIngestTool();
  }, [ingestToolEnabled]);
};
