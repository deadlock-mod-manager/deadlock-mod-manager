import type { StateCreator } from "zustand";
import type { State } from "..";

export type FileserverPreference = "default" | "auto" | string;

export type ProxyProtocol = "http" | "https" | "socks5";

export type ProxyConfig = {
  enabled: boolean;
  protocol: ProxyProtocol;
  host: string;
  port: number;
  authEnabled: boolean;
  username: string;
  password: string;
  noProxy: string;
};

export const DEFAULT_PROXY_CONFIG: ProxyConfig = {
  enabled: false,
  protocol: "http",
  host: "",
  port: 8080,
  authEnabled: false,
  username: "",
  password: "",
  noProxy: "",
};

export type NetworkState = {
  fileserverPreference: FileserverPreference;
  fileserverLatencyMs: Record<string, number>;
  proxyConfig: ProxyConfig;
  setFileserverPreference: (pref: FileserverPreference) => void;
  setFileserverLatencyMs: (latencies: Record<string, number>) => void;
  setProxyConfig: (config: ProxyConfig) => void;
};

export const networkDeepMergeKeys = [
  "proxyConfig",
] as const satisfies readonly (keyof NetworkState)[];

export const createNetworkSlice: StateCreator<State, [], [], NetworkState> = (
  set,
) => ({
  fileserverPreference: "default",
  fileserverLatencyMs: {},
  proxyConfig: DEFAULT_PROXY_CONFIG,
  setFileserverPreference: (pref: FileserverPreference) =>
    set(() => ({ fileserverPreference: pref })),
  setFileserverLatencyMs: (latencies: Record<string, number>) =>
    set(() => ({ fileserverLatencyMs: latencies })),
  setProxyConfig: (config: ProxyConfig) => set(() => ({ proxyConfig: config })),
});
