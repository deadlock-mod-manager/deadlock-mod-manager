import { toast } from "@deadlock-mods/ui/components/sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { formatPluginSize } from "@/components/plugins/plugin-format";
import { useConfirm } from "@/components/providers/alert-dialog";
import { getErrorMessage } from "@/lib/errors";
import {
  clearExternalPluginData,
  EXTERNAL_PLUGINS_QUERY_KEY,
  grantExternalPlugin,
  removeExternalPlugin,
  revokeExternalPlugin,
  setExternalPluginEnabled,
} from "@/lib/external-plugins";
import logger from "@/lib/logger";
import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";

const useRefreshPlugins = () => {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: EXTERNAL_PLUGINS_QUERY_KEY });
};

const reportError = (title: string) => (error: Error) => {
  logger.errorOnly(error);
  toast.error(title, { description: getErrorMessage(error) });
};

/** Grant edits, data clearing, revoking, removing and switching a plugin on or off. */
export const usePluginActions = (plugin: ExternalPluginSummary) => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const refresh = useRefreshPlugins();
  const name = plugin.name;

  const grant = useMutation({
    mutationFn: (change: {
      filePath: string | null;
      profileFolder: string | null;
    }) =>
      grantExternalPlugin({
        pluginId: plugin.id,
        expectedHash: plugin.packageHash,
        ...change,
      }),
    meta: { skipGlobalErrorHandler: true },
    onSuccess: () => {
      toast.success(t("plugins.access.actions.grantSaved", { name }));
    },
    onError: reportError(t("plugins.access.actions.grantFailed")),
    onSettled: refresh,
  });

  const clearData = useMutation({
    mutationFn: () => clearExternalPluginData(plugin.id),
    meta: { skipGlobalErrorHandler: true },
    onSuccess: () => {
      toast.success(t("plugins.access.actions.cleared", { name }));
    },
    onError: reportError(t("plugins.access.actions.clearFailed")),
    onSettled: refresh,
  });

  const revoke = useMutation({
    mutationFn: () => revokeExternalPlugin(plugin.id),
    meta: { skipGlobalErrorHandler: true },
    onSuccess: () => {
      toast.success(t("plugins.access.actions.revoked", { name }));
    },
    onError: reportError(t("plugins.access.actions.revokeFailed")),
    onSettled: refresh,
  });

  const remove = useMutation({
    mutationFn: () => removeExternalPlugin(plugin.id),
    meta: { skipGlobalErrorHandler: true },
    onSuccess: () => {
      toast.success(t("plugins.manage.panel.removed", { name }));
    },
    onError: reportError(t("plugins.manage.panel.removeFailed")),
    onSettled: refresh,
  });

  const setEnabled = useMutation({
    mutationFn: (enabled: boolean) =>
      setExternalPluginEnabled(plugin.id, enabled),
    meta: { skipGlobalErrorHandler: true },
    onError: reportError(t("plugins.manage.toggleFailed")),
    onSettled: refresh,
  });

  const confirmClearData = async () => {
    const accepted = await confirm({
      title: t("plugins.access.actions.clearConfirmTitle", { name }),
      body: t("plugins.access.actions.clearConfirmBody", {
        size: formatPluginSize(plugin.storageBytes),
      }),
      actionButton: t("plugins.access.actions.clearData"),
      cancelButton: t("common.cancel"),
      tone: "destructive",
    });
    if (accepted) clearData.mutate();
  };

  const confirmRevoke = async () => {
    const accepted = await confirm({
      title: t("plugins.access.actions.revokeConfirmTitle", { name }),
      body: t("plugins.access.actions.revokeConfirmBody"),
      actionButton: t("plugins.access.actions.revokeConfirmAction"),
      cancelButton: t("common.cancel"),
      tone: "destructive",
    });
    if (accepted) revoke.mutate();
  };

  const confirmRemove = async () => {
    const accepted = await confirm({
      title: t("plugins.manage.panel.removeConfirmTitle", { name }),
      body: t("plugins.manage.panel.removeConfirmBody"),
      actionButton: t("plugins.manage.panel.remove"),
      cancelButton: t("common.cancel"),
      tone: "destructive",
    });
    if (accepted) remove.mutate();
  };

  return {
    grant,
    clearData,
    revoke,
    remove,
    setEnabled,
    confirmClearData,
    confirmRevoke,
    confirmRemove,
  };
};
