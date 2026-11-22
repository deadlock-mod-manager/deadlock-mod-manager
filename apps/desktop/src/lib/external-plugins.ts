import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { QueryClient } from "@tanstack/react-query";
import { type FeatureState, isFeatureEnabled } from "@/lib/features";
import { isPluginsBuilt } from "@/lib/runtime-bootstrap";
import type { ExternalPluginActivity } from "@/types/generated/ExternalPluginActivity";
import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";

export const EXTERNAL_PLUGINS_QUERY_KEY = ["external-plugins"] as const;

export const externalPluginActivityQueryKey = (pluginId: string) =>
  [...EXTERNAL_PLUGINS_QUERY_KEY, pluginId, "activity"] as const;

export const EXTERNAL_PLUGINS_CHANGED_EVENT = "external-plugins-changed";

export const listExternalPlugins = () =>
  invoke<ExternalPluginSummary[]>("external_plugins_list");

export const setPluginRuntimeEnabled = async (
  enabled: boolean,
): Promise<void> => {
  if (isPluginsBuilt()) {
    await invoke<void>("external_plugins_set_enabled", { enabled });
  }
};

export const syncPluginRuntime = async (
  queryClient: QueryClient,
  before: FeatureState,
  after: FeatureState,
): Promise<void> => {
  const enabled = isFeatureEnabled(after, "plugins");
  if (enabled === isFeatureEnabled(before, "plugins")) return;
  await setPluginRuntimeEnabled(enabled);
  queryClient.removeQueries({ queryKey: EXTERNAL_PLUGINS_QUERY_KEY });
};

export const installExternalPlugin = (archivePath: string) =>
  invoke<ExternalPluginSummary>("external_plugins_install", { archivePath });

export const installExternalPluginFromUrl = (url: string, sha256: string) =>
  invoke<ExternalPluginSummary>("external_plugins_install_url", {
    url,
    sha256,
  });

export const listExternalPluginActivity = (pluginId: string) =>
  invoke<ExternalPluginActivity[]>("external_plugins_activity", { pluginId });

export const clearExternalPluginData = (pluginId: string) =>
  invoke<void>("external_plugins_clear_data", { pluginId });

export const DEFAULT_PROFILE_FOLDER = "default";

type ExternalPluginGrantRequest = {
  pluginId: string;
  expectedHash: string;
  filePath: string | null;
  profileFolder: string | null;
};

export const grantExternalPlugin = (request: ExternalPluginGrantRequest) =>
  invoke<void>("external_plugins_grant", request);

export const revokeExternalPlugin = (pluginId: string) =>
  invoke<void>("external_plugins_revoke", { pluginId });

export const setExternalPluginEnabled = (pluginId: string, enabled: boolean) =>
  invoke<void>("external_plugins_enable", { pluginId, enabled });

export const removeExternalPlugin = (pluginId: string) =>
  invoke<void>("external_plugins_remove", { pluginId });

export const externalPluginViewQueryKey = (pluginId: string) =>
  [...EXTERNAL_PLUGINS_QUERY_KEY, pluginId, "view"] as const;

export const openExternalPluginView = (pluginId: string) =>
  invoke<string>("external_plugins_open_view", { pluginId });

export const externalPluginFrameUrl = (token: string) =>
  `${convertFileSrc("", "dmm-plugin")}frame/${token}/`;

export const callExternalPluginFrame = (
  token: string,
  command: string,
  payloadJson: string,
) =>
  invoke<string>("external_plugins_frame_call", {
    token,
    command,
    payloadJson,
  });

export const applyExternalPluginUpdate = (
  pluginId: string,
  expectedHash: string,
) =>
  invoke<ExternalPluginSummary>("external_plugins_apply_update", {
    pluginId,
    expectedHash,
  });

export const discardExternalPluginUpdate = (pluginId: string) =>
  invoke<void>("external_plugins_discard_update", { pluginId });

export const EXTERNAL_PLUGINS_BLOCKED_EVENT = "external-plugins-blocked";

export const externalPluginBlockedQueryKey = (pluginId: string) =>
  ["external-plugin-blocked", pluginId] as const;

export const EXTERNAL_PLUGINS_NOTIFICATION_EVENT =
  "external-plugins-notification";
