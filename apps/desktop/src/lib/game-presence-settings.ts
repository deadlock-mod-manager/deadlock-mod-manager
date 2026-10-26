import { invoke } from "@tauri-apps/api/core";
import { usePersistedStore } from "@/lib/store";

export const applyGamePresenceSetting = async (
  enabled: boolean,
): Promise<void> => {
  if (!enabled) {
    await invoke("clear_steam_condebug");
  }
  usePersistedStore.getState().setGamePresenceEnabled(enabled);
};
