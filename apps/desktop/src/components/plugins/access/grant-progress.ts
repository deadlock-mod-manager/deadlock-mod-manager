import { isPermissionGranted } from "@/components/plugins/plugin-permissions";
import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";

export const grantProgress = (plugin: ExternalPluginSummary) => {
  const done = plugin.requiredPermissions.filter((permission) =>
    isPermissionGranted(plugin.grant, permission),
  ).length;
  return { done, total: plugin.requiredPermissions.length };
};
