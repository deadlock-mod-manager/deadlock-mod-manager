import {
  ArrowCircleUpIcon,
  ArrowClockwiseIcon,
  ArrowRightIcon,
  FileIcon,
  FolderSimpleIcon,
  GlobeIcon,
  KeyIcon,
  ShieldCheckIcon,
  UserCircleIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { usePluginActions } from "@/components/plugins/access/use-plugin-actions";
import { usePluginProfiles } from "@/components/plugins/access/use-plugin-profiles";
import {
  AccessScope,
  PluginRow,
  PluginSwitch,
  RowButton,
  StatusPill,
} from "@/components/plugins/manage/plugin-row";
import { PluginTile } from "@/components/plugins/plugin-identity";
import { findPermission } from "@/components/plugins/plugin-permissions";
import { listState } from "@/components/plugins/plugin-status";
import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";

const pluginPath = (plugin: ExternalPluginSummary) =>
  `/ext/${encodeURIComponent(plugin.id)}`;

const AccessLine = ({ plugin }: { plugin: ExternalPluginSummary }) => {
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
  return (
    <AccessScope icon={ShieldCheckIcon}>
      {t("plugins.manage.line.noAccess")}
    </AccessScope>
  );
};

type ExternalPluginRowProps = {
  plugin: ExternalPluginSummary;
  selected?: boolean;
  onSelect?: () => void;
  /** On the Updates tab the waiting update outranks setup and restart. */
  updateFirst?: boolean;
};

export const ExternalPluginRow = ({
  plugin,
  selected,
  onSelect,
  updateFirst,
}: ExternalPluginRowProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setEnabled } = usePluginActions(plugin);
  const state = listState(plugin);

  const updateButton = (
    <RowButton
      icon={ArrowCircleUpIcon}
      onClick={() => navigate(`${pluginPath(plugin)}?review=update`)}>
      {t("plugins.manage.update")}
    </RowButton>
  );

  const action = (() => {
    if (updateFirst && plugin.pendingUpdate) return updateButton;
    if (plugin.status === "quarantined") {
      return (
        <RowButton
          disabled={setEnabled.isPending}
          icon={ArrowClockwiseIcon}
          onClick={() => setEnabled.mutate(true)}>
          {t("plugins.manage.restart")}
        </RowButton>
      );
    }
    if (plugin.status === "needsConsent") {
      return (
        <RowButton
          icon={KeyIcon}
          onClick={() => navigate(pluginPath(plugin))}
          variant='primary'>
          {t("plugins.manage.setUp")}
        </RowButton>
      );
    }
    return plugin.pendingUpdate ? updateButton : null;
  })();

  return (
    <PluginRow
      accessLine={<AccessLine plugin={plugin} />}
      actions={
        <>
          {action}
          <PluginSwitch
            aria-label={t("plugins.manage.toggle", { name: plugin.name })}
            checked={plugin.status === "enabled"}
            disabled={plugin.status === "needsConsent" || setEnabled.isPending}
            onCheckedChange={(checked) => setEnabled.mutate(checked)}
          />
        </>
      }
      name={plugin.name}
      onSelect={onSelect}
      selected={selected}
      status={<StatusPill label={t(state.labelKey)} tone={state.tone} />}
      tile={
        <PluginTile
          accent={plugin.accent}
          fillAlpha='1A'
          glyphSize={20}
          icon={plugin.icon}
          radius={10}
          size={40}
        />
      }
      version={plugin.version}
    />
  );
};
