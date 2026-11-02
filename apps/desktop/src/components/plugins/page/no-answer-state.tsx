import { ArrowClockwiseIcon, WarningIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { ManagePluginsButton } from "@/components/plugins/page/manage-plugins-button";
import { StateArea } from "@/components/plugins/page/state-area";
import { TONE_COLOR } from "@/components/plugins/plugin-status";
import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";
import { PageButton } from "./page-button";
import { usePluginActions } from "./use-plugin-actions";

export const NoAnswerState = ({
  plugin,
  onReload,
}: {
  plugin: ExternalPluginSummary;
  onReload: () => void;
}) => {
  const { t } = useTranslation();
  const { managePath } = usePluginActions(plugin);
  return (
    <StateArea
      body={t("plugins.page.noAnswer.body")}
      color={TONE_COLOR.danger}
      icon={WarningIcon}
      title={t("plugins.page.noAnswer.title", { name: plugin.name })}>
      <PageButton onClick={onReload} variant='primary'>
        <ArrowClockwiseIcon />
        {t("plugins.page.noAnswer.reload")}
      </PageButton>
      <ManagePluginsButton path={managePath} />
    </StateArea>
  );
};
