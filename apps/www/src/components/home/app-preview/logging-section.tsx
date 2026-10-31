import { useTranslation } from "react-i18next";
import { ActionRow } from "./action-row";
import { FolderButton } from "./folder-button";
import { Section } from "./section";

export const LoggingSection = () => {
  const { t } = useTranslation("preview");
  return (
    <Section
      title={t("settings.logging.title")}
      description={t("settings.logging.description")}>
      <ActionRow
        label={t("settings.logging.logs.label")}
        description={t("settings.logging.logs.description")}>
        <FolderButton label={t("settings.logging.openFolder")} />
      </ActionRow>
      <ActionRow
        label={t("settings.logging.crashDumps.label")}
        description={t("settings.logging.crashDumps.description")}>
        <FolderButton label={t("settings.logging.openLatest")} />
      </ActionRow>
    </Section>
  );
};
