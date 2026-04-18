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
    <div className='flex flex-col gap-3'>
      <div className='flex flex-row items-center justify-between gap-4 rounded-md border border-border/30 bg-background/40 px-4 py-3 transition-colors hover:bg-muted/30'>
        <div className='flex min-w-0 flex-col gap-1'>
          <h3 className='font-bold text-sm'>{t("settings.occultGeometry")}</h3>
          <p className='text-muted-foreground text-sm'>
            {t("settings.occultGeometryDescription")}
          </p>
        </div>
        <div className='flex shrink-0 items-center space-x-2'>
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

      <div className='flex flex-row items-center justify-between gap-4 rounded-md border border-border/30 bg-background/40 px-4 py-3 transition-colors hover:bg-muted/30'>
        <div className='flex min-w-0 flex-col gap-1'>
          <h3 className='font-bold text-sm'>
            {t("settings.animateOccultGeometry")}
          </h3>
          <p className='text-muted-foreground text-sm'>
            {t("settings.animateOccultGeometryDescription")}
          </p>
        </div>
        <div className='flex shrink-0 items-center space-x-2'>
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
    </div>
  );
};

export default OccultGeometrySettings;
