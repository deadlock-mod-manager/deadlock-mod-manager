import {
  ArrowRightIcon,
  FileIcon,
  EyeIcon,
  FolderSimpleIcon,
  GlobeIcon,
  KeyIcon,
  ShieldCheckIcon,
  UserCircleIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { usePluginProfiles } from "@/components/plugins/access/use-plugin-profiles";
import { AccessScope } from "@/components/plugins/manage/plugin-row";
import { findPermission } from "@/components/plugins/plugin-permissions";
import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";

export const AccessLine = ({ plugin }: { plugin: ExternalPluginSummary }) => {
  const { t } = useTranslation();
  const { profileName } = usePluginProfiles();
  const requests = plugin.requiredPermissions;
  const files = findPermission(requests, "files");
  const mods = findPermission(requests, "mods");
  const network = findPermission(requests, "network");
  const file = plugin.grant?.file ?? null;
  const profileFolder = plugin.grant?.profileFolder ?? null;

  if (plugin.status === "quarantined") {
    return (
      <AccessScope icon={WarningIcon}>
        {t("plugins.manage.line.crashed")}
      </AccessScope>
    );
  }
  if (plugin.status === "needsConsent") {
    if (mods?.profiles === "picked" && profileFolder === null) {
      return (
        <AccessScope icon={UserCircleIcon}>
          {t("plugins.manage.line.needsProfile")}
        </AccessScope>
      );
    }
    if (files && file?.kind !== files.kind) {
      return files.kind === "folder" ? (
        <AccessScope icon={FolderSimpleIcon}>
          {t("plugins.manage.line.needsFolder")}
        </AccessScope>
      ) : (
        <AccessScope icon={FileIcon}>
          {t("plugins.manage.line.needsFile")}
        </AccessScope>
      );
    }
    return (
      <AccessScope icon={KeyIcon}>
        {t("plugins.manage.line.needsSetup")}
      </AccessScope>
    );
  }
  const profile =
    mods?.profiles === "all"
      ? t("plugins.permissions.mods.allProfiles")
      : profileFolder === null
        ? null
        : profileName(profileFolder);
  if (file || profile) {
    return (
      <>
        {file ? (
          <AccessScope
            icon={file.kind === "folder" ? FolderSimpleIcon : FileIcon}
            mono>
            {file.name}
          </AccessScope>
        ) : null}
        {file && profile ? (
          <ArrowRightIcon className='shrink-0' color='#7C756E' size={11} />
        ) : null}
        {profile ? (
          <AccessScope icon={UserCircleIcon}>{profile}</AccessScope>
        ) : null}
      </>
    );
  }
  if (network) {
    return (
      <AccessScope icon={GlobeIcon} mono>
        {network.hosts.join(", ")}
      </AccessScope>
    );
  }
  if (findPermission(requests, "events")) {
    return (
      <AccessScope icon={EyeIcon}>
        {t("plugins.permissions.events.scope")}
      </AccessScope>
    );
  }
  return (
    <AccessScope icon={ShieldCheckIcon}>
      {t("plugins.manage.line.noAccess")}
    </AccessScope>
  );
};
