import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { Slider } from "@deadlock-mods/ui/components/slider";
import { useTranslation } from "react-i18next";
import type { ViewerLook } from "./viewer-tool-types";

export function ViewerLightingControls({
  look,
  onChange,
}: {
  look: ViewerLook;
  onChange: (look: ViewerLook) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className='space-y-3 px-2 py-2 text-xs'>
      <Select
        value={look.lighting}
        onValueChange={(lighting) => {
          if (
            lighting === "studio" ||
            lighting === "neutral" ||
            lighting === "dramatic"
          )
            onChange({ ...look, lighting });
        }}>
        <SelectTrigger
          className='h-8 text-xs'
          aria-label={t("modelPreview.lighting")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='studio'>
            {t("modelPreview.lightingStudio")}
          </SelectItem>
          <SelectItem value='neutral'>
            {t("modelPreview.lightingNeutral")}
          </SelectItem>
          <SelectItem value='dramatic'>
            {t("modelPreview.lightingDramatic")}
          </SelectItem>
        </SelectContent>
      </Select>
      <div className='flex justify-between'>
        <span>{t("modelPreview.lightIntensity")}</span>
        <output>{look.lightIntensity.toFixed(2)}</output>
      </div>
      <Slider
        aria-label={t("modelPreview.lightIntensity")}
        min={0}
        max={2}
        step={0.05}
        value={[look.lightIntensity]}
        onValueChange={([lightIntensity]) =>
          lightIntensity !== undefined && onChange({ ...look, lightIntensity })
        }
      />
      <div className='flex justify-between'>
        <span>{t("modelPreview.bloomStrength")}</span>
        <output>{look.bloomStrength.toFixed(2)}</output>
      </div>
      <Slider
        aria-label={t("modelPreview.bloomStrength")}
        className='data-[disabled]:opacity-30'
        disabled={!look.bloom}
        min={0}
        max={1.5}
        step={0.05}
        value={[look.bloomStrength]}
        onValueChange={([bloomStrength]) =>
          bloomStrength !== undefined && onChange({ ...look, bloomStrength })
        }
      />
      <p className='text-[10px] text-muted-foreground'>
        {t("modelPreview.lightingPreviewOnly")}
      </p>
    </div>
  );
}
