import { Label } from "@deadlock-mods/ui/components/label";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { useTranslation } from "react-i18next";
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
      <div className='flex items-center justify-between'>
        <div className='space-y-1'>
          <Label className='font-bold text-sm'>{t("settings.occultGeometry")}</Label>
          <p className='text-muted-foreground text-sm'>
            {t("settings.occultGeometryDescription")}
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <Switch
            checked={showOccultGeometry}
            id='toggle-show-occult-geometry'
            onCheckedChange={setShowOccultGeometry}
          />
          <Label htmlFor='toggle-show-occult-geometry'>
            {showOccultGeometry ? t("status.enabled") : t("status.disabled")}
          </Label>
        </div>
      </div>

      <div className='flex items-center justify-between'>
        <div className='space-y-1'>
          <Label className='font-bold text-sm'>
            {t("settings.animateOccultGeometry")}
          </Label>
          <p className='text-muted-foreground text-sm'>
            {t("settings.animateOccultGeometryDescription")}
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <Switch
            checked={animateOccultGeometry}
            disabled={!showOccultGeometry}
            id='toggle-animate-occult-geometry'
            onCheckedChange={setAnimateOccultGeometry}
          />
          <Label htmlFor='toggle-animate-occult-geometry'>
            {animateOccultGeometry ? t("status.enabled") : t("status.disabled")}
          </Label>
        </div>
      </div>
    </>
  );
};

export default OccultGeometrySettings;
