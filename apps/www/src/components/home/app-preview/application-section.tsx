import { useTranslation } from "react-i18next";
import { LocalToggle } from "./local-toggle";
import { usePreviewState } from "./preview-state";
import { Section } from "./section";
import { ToggleRow } from "./toggle-row";

export const ApplicationSection = () => {
  const { t } = useTranslation("preview");
  const { appearance, setAppearance } = usePreviewState();
  return (
    <>
      <Section
        title={t("settings.system.title")}
        description={t("settings.system.description")}>
        <LocalToggle
          label={t("settings.system.autoReapply.label")}
          description={t("settings.system.autoReapply.description")}
          initial
        />
        <LocalToggle
          label={t("settings.system.heroConflict.label")}
          description={t("settings.system.heroConflict.description")}
          initial
        />
        <LocalToggle
          label={t("settings.system.paginated.label")}
          description={t("settings.system.paginated.description")}
          initial={false}
        />
      </Section>
      <Section
        title={t("settings.appearance.title")}
        description={t("settings.appearance.description")}>
        <ToggleRow
          label={t("settings.appearance.geometry.label")}
          description={t("settings.appearance.geometry.description")}
          checked={appearance.geometry}
          onCheckedChange={(geometry) => setAppearance({ geometry })}
        />
        <ToggleRow
          label={t("settings.appearance.animateGeometry.label")}
          description={t("settings.appearance.animateGeometry.description")}
          checked={appearance.animateGeometry}
          onCheckedChange={(animateGeometry) =>
            setAppearance({ animateGeometry })
          }
        />
      </Section>
    </>
  );
};
