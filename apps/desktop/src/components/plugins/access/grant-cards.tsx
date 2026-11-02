import {
  BellIcon,
  EraserIcon,
  EyeIcon,
  GameControllerIcon,
  GlobeIcon,
  HardDriveIcon,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { CardAction } from "@/components/plugins/access/card-action";
import { GrantCard } from "@/components/plugins/access/grant-card";
import { usePluginActions } from "@/components/plugins/access/use-plugin-actions";
import { formatPluginSize } from "@/components/plugins/plugin-format";
import {
  permissionTokens,
  sortPermissions,
  usePermissionCopy,
} from "@/components/plugins/plugin-permissions";
import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";
import { FilesGrantCard } from "./files-grant-card";
import { ModsGrantCard } from "./mods-grant-card";

type PermissionGrantCardsProps = {
  plugin: ExternalPluginSummary;
  /** Called before leaving for the plugin's setup page, e.g. to close a sheet. */
  onNavigate?: () => void;
};

/** One card per request the plugin needs, with the value granted and a way to change it. */
export const PermissionGrantCards = ({
  plugin,
  onNavigate,
}: PermissionGrantCardsProps) => {
  const { t } = useTranslation();
  const describe = usePermissionCopy();
  const { grant, clearData, confirmClearData } = usePluginActions(plugin);

  return sortPermissions(plugin.requiredPermissions).map((permission) => {
    const copy = describe(permission);
    switch (permission.id) {
      case "files":
        return (
          <FilesGrantCard
            grant={grant}
            key={permission.id}
            plugin={plugin}
            request={permission}
            copy={copy}
            onNavigate={onNavigate}
          />
        );
      case "mods":
        return (
          <ModsGrantCard
            grant={grant}
            key={permission.id}
            plugin={plugin}
            request={permission}
            copy={copy}
            onNavigate={onNavigate}
          />
        );
      case "network":
        return (
          <GrantCard
            action={null}
            copy={copy}
            key={permission.id}
            scope={permission.hosts.join(", ")}
            scopeIcon={GlobeIcon}
            scopeMono
            tokens={permissionTokens(permission)}
          />
        );
      case "game":
        return (
          <GrantCard
            action={null}
            copy={copy}
            key={permission.id}
            scope={t("plugins.permissions.game.scope")}
            scopeIcon={GameControllerIcon}
            tokens={permissionTokens(permission)}
          />
        );
      case "storage":
        return (
          <GrantCard
            action={
              <CardAction
                disabled={clearData.isPending}
                icon={EraserIcon}
                label={t("plugins.access.actions.clearData")}
                onClick={() => void confirmClearData()}
              />
            }
            copy={copy}
            key={permission.id}
            scope={t("plugins.permissions.storage.value", {
              size: formatPluginSize(plugin.storageBytes),
            })}
            scopeIcon={HardDriveIcon}
            tokens={permissionTokens(permission)}
          />
        );
      case "events":
        return (
          <GrantCard
            action={null}
            copy={copy}
            key={permission.id}
            scope={t("plugins.permissions.events.scope")}
            scopeIcon={EyeIcon}
            tokens={permissionTokens(permission)}
          />
        );
      case "notifications":
        return (
          <GrantCard
            action={null}
            copy={copy}
            key={permission.id}
            scope={t("plugins.permissions.notifications.scope")}
            scopeIcon={BellIcon}
            tokens={permissionTokens(permission)}
          />
        );
    }
  });
};
