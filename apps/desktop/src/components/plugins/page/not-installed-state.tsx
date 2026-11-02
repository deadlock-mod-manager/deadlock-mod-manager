import { PuzzlePieceIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { ManagePluginsButton } from "@/components/plugins/page/manage-plugins-button";
import { StateArea } from "@/components/plugins/page/state-area";
import { TONE_COLOR } from "@/components/plugins/plugin-status";
import { MANAGE_PLUGINS_PATH } from "./use-plugin-actions";

export const NotInstalledState = () => {
  const { t } = useTranslation();
  return (
    <StateArea
      body={t("plugins.page.notInstalled.body")}
      color={TONE_COLOR.neutral}
      icon={PuzzlePieceIcon}
      title={t("plugins.page.notInstalled.title")}>
      <ManagePluginsButton path={MANAGE_PLUGINS_PATH} />
    </StateArea>
  );
};
