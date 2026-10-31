import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import {
  EXTERNAL_PLUGINS_BLOCKED_EVENT,
  EXTERNAL_PLUGINS_CHANGED_EVENT,
  externalPluginActivityQueryKey,
  listExternalPluginActivity,
} from "@/lib/external-plugins";
import type { ExternalPluginBlockedEvent } from "@/types/generated/ExternalPluginBlockedEvent";

/** A plugin's activity log, newest first, refetched when the plugin changes
 * or the host blocks one of its requests. */
export const useExternalPluginActivity = (pluginId: string) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const refresh = (changedId: string) => {
      if (changedId !== pluginId) return;
      void queryClient.invalidateQueries({
        queryKey: externalPluginActivityQueryKey(pluginId),
      });
    };
    const unlistenChanged = listen<string>(
      EXTERNAL_PLUGINS_CHANGED_EVENT,
      (event) => refresh(event.payload),
    );
    const unlistenBlocked = listen<ExternalPluginBlockedEvent>(
      EXTERNAL_PLUGINS_BLOCKED_EVENT,
      (event) => refresh(event.payload.pluginId),
    );
    return () => {
      void unlistenChanged.then((stop) => stop());
      void unlistenBlocked.then((stop) => stop());
    };
  }, [pluginId, queryClient]);

  return useQuery({
    queryKey: externalPluginActivityQueryKey(pluginId),
    queryFn: () => listExternalPluginActivity(pluginId),
  });
};
