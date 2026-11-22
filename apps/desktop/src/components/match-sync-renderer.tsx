import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import logger from "@/lib/logger";

export const MatchSyncRenderer = () => {
  useEffect(() => {
    invoke("resume_match_sync_monitoring").catch((error) => {
      logger.withError(error).warn("Failed to resume match-sync monitoring");
    });
  }, []);

  return null;
};
