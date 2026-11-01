import { sortPermissions } from "@/components/plugins/plugin-permissions";
import type { ExternalPluginPendingUpdate } from "@/types/generated/ExternalPluginPendingUpdate";
import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";

/** Requests the update adds or widens, and the ones it keeps as they are. */
export const updateChanges = (
  plugin: ExternalPluginSummary,
  update: ExternalPluginPendingUpdate,
) => {
  const added = sortPermissions(update.newPermissions);
  const kept = sortPermissions(update.requiredPermissions).filter(
    (permission) => !added.some((entry) => entry.id === permission.id),
  );
  const removed = sortPermissions(plugin.requiredPermissions).filter(
    (permission) =>
      !update.requiredPermissions.some((entry) => entry.id === permission.id),
  );
  return { added, kept, removed };
};
