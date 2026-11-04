import { useTranslation } from "react-i18next";
import { LocalToggle } from "./local-toggle";
import { Section } from "./section";

export const LaunchOptionsSection = () => {
  const { t } = useTranslation("preview");
  return (
    <Section
      title={t("settings.launchOptions.title")}
      description={t("settings.launchOptions.description")}>
      <LocalToggle
        label={t("settings.launchOptions.vanilla.label")}
        description={t("settings.launchOptions.vanilla.description")}
        initial={false}
      />
      <LocalToggle
        label={t("settings.launchOptions.autoexec.label")}
        description={t("settings.launchOptions.autoexec.description")}
        initial
      />
    </Section>
  );
};
