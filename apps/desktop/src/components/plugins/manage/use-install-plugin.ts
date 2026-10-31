import { toast } from "@deadlock-mods/ui/components/sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { getErrorMessage } from "@/lib/errors";
import {
  EXTERNAL_PLUGINS_QUERY_KEY,
  externalPluginBlockedQueryKey,
  installExternalPlugin,
  installExternalPluginFromUrl,
} from "@/lib/external-plugins";
import logger from "@/lib/logger";
import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";

/** After an install, land on the plugin's page so the user can finish setup. */
const useInstalled = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return {
    onSuccess: (plugin: ExternalPluginSummary | null) => {
      if (!plugin) return;
      toast.success(
        t("plugins.manage.installed", {
          name: plugin.name,
          version: plugin.version,
        }),
      );
      void queryClient.invalidateQueries({
        queryKey: EXTERNAL_PLUGINS_QUERY_KEY,
      });
      queryClient.removeQueries({
        queryKey: externalPluginBlockedQueryKey(plugin.id),
      });
      navigate(`/ext/${encodeURIComponent(plugin.id)}`);
    },
    onError: (error: Error) => {
      logger.errorOnly(error);
      toast.error(t("plugins.manage.installFailed"), {
        description: getErrorMessage(error),
      });
    },
  };
};

/** The picker stays outside the mutation so the button only reads "Installing" once a file is chosen. */
export const useInstallFromFile = () => {
  const { t } = useTranslation();
  const mutation = useMutation({
    mutationFn: installExternalPlugin,
    meta: { skipGlobalErrorHandler: true },
    ...useInstalled(),
  });
  const pickAndInstall = async () => {
    const archivePath = await open({
      multiple: false,
      directory: false,
      title: t("plugins.manage.chooseArchive"),
      filters: [
        { name: t("plugins.manage.archiveFilter"), extensions: ["zip"] },
      ],
    });
    if (archivePath) mutation.mutate(archivePath);
  };
  return { ...mutation, pickAndInstall };
};

export const useInstallFromCatalog = () =>
  useMutation({
    mutationFn: ({ url, sha256 }: { url: string; sha256: string }) =>
      installExternalPluginFromUrl(url, sha256),
    meta: { skipGlobalErrorHandler: true },
    ...useInstalled(),
  });
