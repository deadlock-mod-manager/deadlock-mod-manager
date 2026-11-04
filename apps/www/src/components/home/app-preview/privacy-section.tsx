import { useTranslation } from "react-i18next";
import { LocalToggle } from "./local-toggle";
import { Section } from "./section";

export const PrivacySection = () => {
  const { t } = useTranslation("preview");
  return (
    <>
      <Section
        title={t("settings.privacy.title")}
        description={t("settings.privacy.description")}>
        <LocalToggle
          label={t("settings.privacy.hideNsfw.label")}
          description={t("settings.privacy.hideNsfw.description")}
          initial
        />
        <LocalToggle
          label={t("settings.privacy.disableBlur.label")}
          description={t("settings.privacy.disableBlur.description")}
          initial={false}
        />
      </Section>
      <Section title={t("settings.privacy.analytics.title")}>
        <LocalToggle
          label='Google Analytics'
          description={t("settings.privacy.analytics.description")}
          initial={false}
        />
      </Section>
    </>
  );
};
