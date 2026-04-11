import { invoke } from "@tauri-apps/api/core";
import { createLogger } from "./logger";
import { usePersistedStore } from "./store";

const logger = createLogger("proxy");

export const syncProxyConfigToBackend = async () => {
  const { proxyConfig } = usePersistedStore.getState();

  const config = proxyConfig.enabled ? proxyConfig : null;

  try {
    await invoke("set_proxy_config", { config });
    logger
      .withMetadata({ enabled: proxyConfig.enabled })
      .debug("Proxy config synced to backend");
  } catch (error) {
    logger
      .withMetadata({ error })
      .warn("Failed to sync proxy config to backend");
  }
};
