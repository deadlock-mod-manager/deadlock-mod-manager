import { KeyIcon, ShieldWarningIcon, XIcon } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import type { TFunction } from "i18next";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { usePluginProfiles } from "@/components/plugins/access/use-plugin-profiles";
import { findPermission } from "@/components/plugins/plugin-permissions";
import { TONE_COLOR } from "@/components/plugins/plugin-status";
import {
  EXTERNAL_PLUGINS_BLOCKED_EVENT,
  externalPluginBlockedQueryKey,
} from "@/lib/external-plugins";
import type { ExternalPluginActivity } from "@/types/generated/ExternalPluginActivity";
import type { ExternalPluginBlockedEvent } from "@/types/generated/ExternalPluginBlockedEvent";
import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";
import { PageButton } from "./page-button";

/** The newest request DMM refused for this plugin, until dismissed. Stored in
 * the query cache so it survives remounts and can be seeded directly. */
export const useBlockedRequest = (pluginId: string) => {
  const queryClient = useQueryClient();
  const queryKey = externalPluginBlockedQueryKey(pluginId);

  useEffect(() => {
    const unlisten = listen<ExternalPluginBlockedEvent>(
      EXTERNAL_PLUGINS_BLOCKED_EVENT,
      ({ payload }) => {
        queryClient.setQueryData<ExternalPluginActivity | null>(
          externalPluginBlockedQueryKey(payload.pluginId),
          payload.activity,
        );
      },
    );
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, [queryClient]);

  const blocked = useQuery<ExternalPluginActivity | null>({
    queryKey,
    queryFn: () => null,
    initialData: null,
    staleTime: Number.POSITIVE_INFINITY,
  });

  return {
    activity: blocked.data,
    dismiss: () =>
      queryClient.setQueryData<ExternalPluginActivity | null>(queryKey, null),
  };
};

const describeBlocked = (
  t: TFunction,
  plugin: ExternalPluginSummary,
  activity: ExternalPluginActivity,
  profileName: (folder: string) => string,
) => {
  const name = plugin.name;
  const grant = plugin.grant;
  if (activity.reason === "unknown_method") {
    return t("plugins.page.blocked.unknown", {
      name,
      method: activity.method ?? "",
    });
  }
  switch (activity.permission) {
    case "files":
      return grant?.file
        ? t("plugins.page.blocked.filesOnly", { name, file: grant.file.name })
        : t("plugins.page.blocked.files", { name });
    case "mods": {
      const grantedFolder = grant?.profileFolder ?? null;
      const only = grantedFolder === null ? null : profileName(grantedFolder);
      if (activity.profileFolder) {
        const target = profileName(activity.profileFolder);
        return only
          ? t("plugins.page.blocked.modsInOnly", {
              name,
              target,
              profile: only,
            })
          : t("plugins.page.blocked.modsIn", { name, target });
      }
      return only
        ? t("plugins.page.blocked.modsOnly", { name, profile: only })
        : t("plugins.page.blocked.mods", { name });
    }
    case "network": {
      const hosts = findPermission(
        plugin.requiredPermissions,
        "network",
      )?.hosts;
      if (!activity.host) return t("plugins.page.blocked.networkAny", { name });
      return hosts
        ? t("plugins.page.blocked.networkOnly", {
            name,
            host: activity.host,
            hosts: hosts.join(", "),
          })
        : t("plugins.page.blocked.network", { name, host: activity.host });
    }
    case "game":
      return t("plugins.page.blocked.game", { name });
    case "storage":
      return t("plugins.page.blocked.storage", { name });
    case "notifications":
      return t("plugins.page.blocked.notifications", { name });
    case null:
      return t("plugins.page.blocked.generic", { name });
  }
};

type BlockedToastProps = {
  plugin: ExternalPluginSummary;
  activity: ExternalPluginActivity;
  onDismiss: () => void;
  onReviewAccess: () => void;
};

/** Anchored to the bottom right of the plugin's content area. */
export const BlockedToast = ({
  plugin,
  activity,
  onDismiss,
  onReviewAccess,
}: BlockedToastProps) => {
  const { t } = useTranslation();
  const { findProfileName } = usePluginProfiles();
  const profileName = (folder: string) => findProfileName(folder) ?? folder;
  return (
    <div
      className='absolute right-6 bottom-6 z-20 flex w-[400px] max-w-[calc(100%-48px)] flex-col gap-2.5 rounded-[12px] bg-[#1E1A18] p-4 shadow-[0px_8px_24px_#00000080] ring-1 ring-[#F8717140] ring-inset'
      role='alert'>
      <div className='flex items-center gap-2.5'>
        <ShieldWarningIcon color={TONE_COLOR.danger} size={16} />
        <span className='font-semibold text-[14px] text-foreground leading-[normal]'>
          {t("plugins.page.blocked.title")}
        </span>
        <span className='h-px flex-1' />
        <button
          aria-label={t("plugins.page.blocked.dismiss")}
          className='cursor-pointer rounded-sm text-muted-foreground hover:text-foreground'
          onClick={onDismiss}
          type='button'>
          <XIcon size={14} />
        </button>
      </div>
      <p className='text-[13px] text-muted-foreground leading-[19px]'>
        {describeBlocked(t, plugin, activity, profileName)}
      </p>
      <div className='flex gap-2'>
        <PageButton onClick={onReviewAccess} variant='outline'>
          <KeyIcon />
          {t("plugins.page.blocked.review")}
        </PageButton>
      </div>
    </div>
  );
};
