import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";

export type PluginTone = "ok" | "warn" | "danger" | "info" | "neutral";

export const TONE_COLOR = {
  ok: "#4ADE80",
  warn: "#FBBF24",
  danger: "#F87171",
  info: "#60A5FA",
  neutral: "hsl(var(--muted-foreground))",
} satisfies Record<PluginTone, string>;

type PluginState = { tone: PluginTone; labelKey: string };

/** Status shown in plugin lists, where a waiting update outranks "Running". */
export const listState = (plugin: ExternalPluginSummary): PluginState => {
  if (plugin.pendingUpdate && plugin.status === "enabled") {
    return { tone: "info", labelKey: "plugins.state.updateReady" };
  }
  return pageState(
    plugin,
    "plugins.state.needsAccess",
    "plugins.state.stoppedAfterErrors",
  );
};

/** Status shown on the plugin's own page. */
export const pageState = (
  plugin: ExternalPluginSummary,
  needsConsentKey = "plugins.state.needsSetup",
  quarantinedKey = "plugins.state.stopped",
): PluginState => {
  switch (plugin.status) {
    case "enabled":
      return { tone: "ok", labelKey: "plugins.state.running" };
    case "needsConsent":
      return { tone: "warn", labelKey: needsConsentKey };
    case "quarantined":
      return { tone: "danger", labelKey: quarantinedKey };
    case "disabled":
      return { tone: "neutral", labelKey: "plugins.state.off" };
  }
};
