import {
  ArrowCircleUpIcon,
  ArrowClockwiseIcon,
  KeyIcon,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { usePluginActions } from "@/components/plugins/access/use-plugin-actions";
import { AccessLine } from "@/components/plugins/manage/access-line";
import { PluginRow } from "@/components/plugins/manage/plugin-row";
import { PluginSwitch } from "@/components/plugins/manage/plugin-switch";
import { RowButton } from "@/components/plugins/manage/row-button";
import { StatusPill } from "@/components/plugins/manage/status-pill";
import { PluginTile } from "@/components/plugins/plugin-identity";
import { listState } from "@/components/plugins/plugin-status";
import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";

const pluginPath = (plugin: ExternalPluginSummary) =>
  `/ext/${encodeURIComponent(plugin.id)}`;

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
          fillAlpha={10}
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
