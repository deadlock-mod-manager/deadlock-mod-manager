import { toast } from "@deadlock-mods/ui/components/sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  EXTERNAL_PLUGINS_CHANGED_EVENT,
  EXTERNAL_PLUGINS_NOTIFICATION_EVENT,
  EXTERNAL_PLUGINS_QUERY_KEY,
  listExternalPlugins,
} from "@/lib/external-plugins";
import type { ExternalPluginNotificationEvent } from "@/types/generated/ExternalPluginNotificationEvent";
import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";

/** Installed external plugins, refetched whenever the backend disables,
 * revokes, updates, removes or stops one. */
export const useExternalPlugins = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const unlisten = listen<string>(EXTERNAL_PLUGINS_CHANGED_EVENT, () => {
      void queryClient.invalidateQueries({
        queryKey: EXTERNAL_PLUGINS_QUERY_KEY,
      });
    });
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, [queryClient]);

  return useQuery({
    queryKey: EXTERNAL_PLUGINS_QUERY_KEY,
    queryFn: listExternalPlugins,
  });
};

/** Shows the notifications plugins send as toasts under the plugin's name. */
export const useExternalPluginNotifications = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  useEffect(() => {
    const unlisten = listen<ExternalPluginNotificationEvent>(
      EXTERNAL_PLUGINS_NOTIFICATION_EVENT,
      ({ payload }) => {
        const name =
          queryClient
            .getQueryData<ExternalPluginSummary[]>(EXTERNAL_PLUGINS_QUERY_KEY)
            ?.find((plugin) => plugin.id === payload.pluginId)?.name ??
          payload.pluginId;
        toast(t("plugins.notification.title", { name, title: payload.title }), {
          description: payload.body || undefined,
        });
      },
    );
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, [queryClient, t]);
};
