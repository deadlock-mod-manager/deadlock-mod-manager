import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { ExternalPluginActivity } from "@/types/generated/ExternalPluginActivity";
import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";

export const EXTERNAL_PLUGINS_QUERY_KEY = ["external-plugins"] as const;

/** Under the plugin list key, so invalidating the list refreshes it too. */
export const externalPluginActivityQueryKey = (pluginId: string) =>
  [...EXTERNAL_PLUGINS_QUERY_KEY, pluginId, "activity"] as const;

/** Emitted by the backend with a plugin id when it changes on its own. */
export const EXTERNAL_PLUGINS_CHANGED_EVENT = "external-plugins-changed";

export const listExternalPlugins = () =>
  invoke<ExternalPluginSummary[]>("external_plugins_list");

export const installExternalPlugin = (archivePath: string) =>
  invoke<ExternalPluginSummary>("external_plugins_install", { archivePath });

export const installExternalPluginFromUrl = (url: string, sha256: string) =>
  invoke<ExternalPluginSummary>("external_plugins_install_url", {
    url,
    sha256,
  });

/** Newest first. */
export const listExternalPluginActivity = (pluginId: string) =>
  invoke<ExternalPluginActivity[]>("external_plugins_activity", { pluginId });

export const clearExternalPluginData = (pluginId: string) =>
  invoke<void>("external_plugins_clear_data", { pluginId });

/** How a grant names the default profile, whose mods live in the root addons folder. */
export const DEFAULT_PROFILE_FOLDER = "default";

type ExternalPluginGrantRequest = {
  pluginId: string;
  /** The picked file or folder, for plugins that ask for `files`. */
  filePath: string | null;
  /** The picked profile, for plugins that ask for `mods` in one profile. */
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

/** Where the plugin protocol serves `frame/<plugin id>/` for embedded views. */
export const externalPluginFrameUrl = (pluginId: string) =>
  `${convertFileSrc("", "dmm-plugin")}frame/${encodeURIComponent(pluginId)}/`;

/** Relays a call from the frame this page embedded for `pluginId`. */
export const callExternalPluginFrame = (
  pluginId: string,
  command: string,
  payloadJson: string,
) =>
  invoke<string>("external_plugins_frame_call", {
    pluginId,
    command,
    payloadJson,
  });

/** Installs the waiting update, granting the new permissions it asks for. */
export const applyExternalPluginUpdate = (pluginId: string) =>
  invoke<ExternalPluginSummary>("external_plugins_apply_update", { pluginId });

/** Drops the waiting update; the installed version keeps running. */
export const discardExternalPluginUpdate = (pluginId: string) =>
  invoke<void>("external_plugins_discard_update", { pluginId });

/** Emitted with an `ExternalPluginBlockedEvent` when the host refuses a call. */
export const EXTERNAL_PLUGINS_BLOCKED_EVENT = "external-plugins-blocked";

/** The newest blocked request on a plugin's page until the user dismisses it.
 * Kept outside `EXTERNAL_PLUGINS_QUERY_KEY` so list refetches don't clear it. */
export const externalPluginBlockedQueryKey = (pluginId: string) =>
  ["external-plugin-blocked", pluginId] as const;

/** Emitted with an `ExternalPluginNotificationEvent` when a plugin shows a notification. */
export const EXTERNAL_PLUGINS_NOTIFICATION_EVENT =
  "external-plugins-notification";
