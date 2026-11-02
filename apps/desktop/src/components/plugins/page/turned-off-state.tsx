import { PowerIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { ManagePluginsButton } from "@/components/plugins/page/manage-plugins-button";
import { StateArea } from "@/components/plugins/page/state-area";
import { TONE_COLOR } from "@/components/plugins/plugin-status";
import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";
import { PageButton } from "./page-button";
import { usePluginActions } from "./use-plugin-actions";

export const TurnedOffState = ({
  plugin,
}: {
  plugin: ExternalPluginSummary;
}) => {
  const { t } = useTranslation();
  const { setEnabled, busy, managePath } = usePluginActions(plugin);
  return (
    <StateArea
      body={t("plugins.page.off.body")}
      color={TONE_COLOR.neutral}
      icon={PowerIcon}
      title={t("plugins.page.off.title", { name: plugin.name })}>
      <PageButton
        disabled={busy}
        onClick={() => setEnabled.mutate(true)}
        variant='primary'>
        <PowerIcon />
        {t("plugins.page.off.turnOn")}
      </PageButton>
      <ManagePluginsButton path={managePath} />
    </StateArea>
  );
};
