import { CrosshairCanvas } from "@/components/crosshair/crosshair-canvas";
import {
  type CrosshairConfig,
  DEFAULT_CROSSHAIR_CONFIG,
} from "@deadlock-mods/crosshair/types";
import { buttonVariants } from "@deadlock-mods/ui/components/button";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { CrosshairIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SLIDERS, SWATCHES } from "./crosshair-controls";
import { PageTitle } from "./parts";
import { usePreviewState } from "./preview-state";

export const CrosshairsScreen = () => {
  const { t } = useTranslation("preview");
  const { notify } = usePreviewState();
  const [config, setConfig] = useState<CrosshairConfig>({
    ...DEFAULT_CROSSHAIR_CONFIG,
    gap: 4,
    width: 3,
    height: 12,
    color: SWATCHES[1].color,
  });

  return (
    <div className='px-5 pb-6'>
      <div className='mb-6 flex items-end justify-between'>
        <PageTitle
          title={t("crosshairs.title")}
          subtitle={t("crosshairs.subtitle")}
        />
        <button
          type='button'
          onClick={() =>
            notify(
              t("crosshairs.applied.title"),
              t("crosshairs.applied.description"),
            )
          }
          className={buttonVariants()}>
          <CrosshairIcon />
          {t("crosshairs.apply")}
        </button>
      </div>
      <div className='grid grid-cols-2 gap-6'>
        <div className='space-y-5 rounded-lg border bg-card p-5'>
          <h4 className='font-semibold'>{t("crosshairs.settings")}</h4>
          {SLIDERS.map((slider) => (
            <label key={slider.key} className='block space-y-2'>
              <span className='flex justify-between text-sm'>
                {t(`crosshairs.sliders.${slider.key}`)}
                <span className='text-muted-foreground tabular-nums'>
                  {config[slider.key]}
                </span>
              </span>
              <input
                type='range'
                min={slider.min}
                max={slider.max}
                step={slider.step}
                value={config[slider.key]}
                onChange={(event) =>
                  setConfig((current) => ({
                    ...current,
                    [slider.key]: Number(event.target.value),
                  }))
                }
                className='w-full accent-[hsl(var(--primary))]'
              />
            </label>
          ))}
          <fieldset className='space-y-2'>
            <legend className='mb-2 text-sm'>{t("crosshairs.color")}</legend>
            <div className='flex gap-2'>
              {SWATCHES.map((swatch) => {
                const selected =
                  swatch.color.r === config.color.r &&
                  swatch.color.g === config.color.g &&
                  swatch.color.b === config.color.b;
                return (
                  <button
                    key={swatch.id}
                    type='button'
                    aria-label={t(`crosshairs.swatches.${swatch.id}`)}
                    aria-pressed={selected}
                    onClick={() =>
                      setConfig((current) => ({
                        ...current,
                        color: swatch.color,
                      }))
                    }
                    className={cn(
                      "size-8 rounded-md border-2 transition-transform hover:scale-105",
                      selected ? "border-foreground" : "border-transparent",
                    )}
                    style={{
                      backgroundColor: `rgb(${swatch.color.r} ${swatch.color.g} ${swatch.color.b})`,
                    }}
                  />
                );
              })}
            </div>
          </fieldset>
        </div>
        <div>
          <h4 className='mb-3 font-semibold'>{t("crosshairs.preview")}</h4>
          <div className='overflow-hidden rounded-lg bg-zinc-800 p-4'>
            <CrosshairCanvas config={config} background='bg1' />
          </div>
          <p className='mt-2 text-muted-foreground text-xs'>
            {t("crosshairs.aimHint")}
          </p>
        </div>
      </div>
    </div>
  );
};
