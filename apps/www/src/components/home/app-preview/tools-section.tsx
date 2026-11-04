import { useTranslation } from "react-i18next";
import { ActionRow } from "./action-row";
import { FolderButton } from "./folder-button";
import { Section } from "./section";

export const ToolsSection = () => {
  const { t } = useTranslation("preview");
  return (
    <Section
      title={t("settings.tools.title")}
      description={t("settings.tools.description")}>
      <ActionRow
        label={t("settings.tools.openGameFolder.label")}
        description={t("settings.tools.openGameFolder.description")}>
        <FolderButton label={t("settings.tools.open")} />
      </ActionRow>
      <ActionRow
        label={t("settings.tools.clearCache.label")}
        description={t("settings.tools.clearCache.description")}>
        <FolderButton label={t("settings.tools.clear")} />
      </ActionRow>
    </Section>
  );
};
