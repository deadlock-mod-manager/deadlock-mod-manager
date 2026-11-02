import { PuzzlePieceIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { ManagePluginsButton } from "@/components/plugins/page/manage-plugins-button";
import { StateArea } from "@/components/plugins/page/state-area";
import { TONE_COLOR } from "@/components/plugins/plugin-status";
import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";
import { usePluginActions } from "./use-plugin-actions";

export const NoPageState = ({ plugin }: { plugin: ExternalPluginSummary }) => {
  const { t } = useTranslation();
  const { managePath } = usePluginActions(plugin);
  return (
    <StateArea
      body={t("plugins.page.noPage.body")}
      color={TONE_COLOR.neutral}
      icon={PuzzlePieceIcon}
      title={t("plugins.page.noPage.title", { name: plugin.name })}>
      <ManagePluginsButton path={managePath} />
    </StateArea>
  );
};
