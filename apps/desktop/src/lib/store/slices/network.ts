import type { StateCreator } from "zustand";
import type { State } from "..";
import type { FileserverPreference } from "@/types/generated/FileserverPreference";

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
  proxyConfig: ProxyConfig;
  segmentedDownloads: boolean;
  setFileserverPreference: (pref: FileserverPreference) => void;
  setProxyConfig: (config: ProxyConfig) => void;
  setSegmentedDownloads: (enabled: boolean) => void;
};

export const networkDeepMergeKeys = [
  "proxyConfig",
] as const satisfies readonly (keyof NetworkState)[];

export const createNetworkSlice: StateCreator<State, [], [], NetworkState> = (
  set,
) => ({
  fileserverPreference: "default",
  proxyConfig: DEFAULT_PROXY_CONFIG,
  segmentedDownloads: false,
  setFileserverPreference: (pref: FileserverPreference) =>
    set(() => ({ fileserverPreference: pref })),
  setProxyConfig: (config: ProxyConfig) => set(() => ({ proxyConfig: config })),
  setSegmentedDownloads: (enabled: boolean) =>
    set(() => ({ segmentedDownloads: enabled })),
});
