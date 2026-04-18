import { invoke } from "@tauri-apps/api/core";
import { usePersistedStore } from "./store";

export const syncProxyConfigToBackend = async () => {
  const { proxyConfig } = usePersistedStore.getState();
  const config = proxyConfig.enabled ? proxyConfig : null;
  await invoke("set_proxy_config", { config });
};
