import { toast } from "@deadlock-mods/ui/components/sonner";
import { TrashIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { useConfirm } from "@/components/providers/alert-dialog";
import { getErrorMessage } from "@/lib/errors";
import {
  EXTERNAL_PLUGINS_QUERY_KEY,
  removeExternalPlugin,
  setExternalPluginEnabled,
} from "@/lib/external-plugins";
import logger from "@/lib/logger";
import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";

export const MANAGE_PLUGINS_PATH = "/plugins/manage";

/** Turn on/off (turning on also restarts a plugin stopped after errors) and remove. */
export const usePluginActions = (plugin: ExternalPluginSummary) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: EXTERNAL_PLUGINS_QUERY_KEY });

  const reportFailure = (titleKey: string) => (error: Error) => {
    logger.errorOnly(error);
    toast.error(t(titleKey), { description: getErrorMessage(error) });
  };

  const setEnabled = useMutation({
    mutationFn: (enabled: boolean) =>
      setExternalPluginEnabled(plugin.id, enabled),
    meta: { skipGlobalErrorHandler: true },
    onSettled: () => void refresh(),
    onError: reportFailure("plugins.page.toggleFailed"),
  });

  const remove = useMutation({
    mutationFn: () => removeExternalPlugin(plugin.id),
    meta: { skipGlobalErrorHandler: true },
    onSuccess: () => {
      toast.success(t("plugins.page.remove.done", { name: plugin.name }));
      navigate(MANAGE_PLUGINS_PATH);
      void refresh();
    },
    onError: reportFailure("plugins.page.remove.failed"),
  });

  const confirmRemove = async () => {
    const confirmed = await confirm({
      title: t("plugins.page.remove.title", { name: plugin.name }),
      body: t("plugins.page.remove.body"),
      icon: TrashIcon,
      actionButton: t("plugins.page.remove.action"),
      cancelButton: t("common.cancel"),
      tone: "destructive",
    });
    if (confirmed) remove.mutate();
  };

  return {
    setEnabled,
    remove,
    confirmRemove,
    managePath: `${MANAGE_PLUGINS_PATH}?plugin=${encodeURIComponent(plugin.id)}`,
    busy: setEnabled.isPending || remove.isPending,
  };
};
