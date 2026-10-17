import { useTranslation } from "react-i18next";
import { SettingToggleRow } from "@/components/settings/setting-row";
import { usePersistedStore } from "@/lib/store";

const OccultGeometrySettings = () => {
  const { t } = useTranslation();
  const showOccultGeometry = usePersistedStore((s) => s.showOccultGeometry);
  const animateOccultGeometry = usePersistedStore(
    (s) => s.animateOccultGeometry,
  );
  const setShowOccultGeometry = usePersistedStore(
    (s) => s.setShowOccultGeometry,
  );
  const setAnimateOccultGeometry = usePersistedStore(
    (s) => s.setAnimateOccultGeometry,
  );

  return (
    <>
      <SettingToggleRow
        checked={showOccultGeometry}
        description={t("settings.occultGeometryDescription")}
        id='toggle-show-occult-geometry'
        onCheckedChange={setShowOccultGeometry}
        title={t("settings.occultGeometry")}
      />
      <SettingToggleRow
        checked={animateOccultGeometry}
        description={t("settings.animateOccultGeometryDescription")}
        disabled={!showOccultGeometry}
        id='toggle-animate-occult-geometry'
        onCheckedChange={setAnimateOccultGeometry}
        title={t("settings.animateOccultGeometry")}
      />
    </>
  );
};

export default OccultGeometrySettings;
