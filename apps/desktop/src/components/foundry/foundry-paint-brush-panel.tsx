import { Button } from "@deadlock-mods/ui/components/button";
import { ColorPicker } from "@deadlock-mods/ui/components/color-picker";
import { ScrollArea } from "@deadlock-mods/ui/components/scroll-area";
import { cn } from "@deadlock-mods/ui/lib/utils";
import {
  ArrowCounterClockwiseIcon,
  ArrowSquareOutIcon,
  InfoIcon,
  PaintBrushIcon,
  PenNibIcon,
} from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import logger from "@/lib/logger";
import { useFoundry } from "./foundry-context";
import { FoundryPatternPicker } from "./foundry-pattern-picker";
import { useSkinPalette } from "./foundry-skin-palette";
import { type PaintBrush } from "./use-paint-brush";
import { coverage, PRESET_COLORS, heroPainterUrl } from "./foundry-paint-utils";
import { Swatch } from "./foundry-paint-swatch";
import { SectionLabel } from "./foundry-paint-section-label";
import { SwatchRow } from "./foundry-paint-swatch-row";
import { ScaleSlider } from "./foundry-paint-scale-slider";

/** What the brush is pointed at, for the brush header and the apply button. */
export const useSelectionTitle = () => {
  const { t } = useTranslation();
  const { paintSelection, paintParts } = useFoundry();
  if (paintSelection.kind === "target") {
    return t(`foundry.paint.targets.${paintSelection.target}`);
  }
  const labels = paintSelection.textures.map(
    (texture) =>
      paintParts.find((part) => part.texture === texture)?.label ?? texture,
  );
  return labels.join(", ");
};

/** The right column: color, adjustments and pattern, then Paint. */
export const BrushPanel = ({ brush }: { brush: PaintBrush }) => {
  const { t } = useTranslation();
  const { manifest, workspace, paintSelection, appliedPaint, paintParts } =
    useFoundry();
  const palette = useSkinPalette(manifest?.filePath ?? null, paintParts);
  const [allPatterns, setAllPatterns] = useState(false);
  const title = useSelectionTitle();
  const { paint, update } = brush;

  const recent = useMemo(
    () =>
      [...new Set(Object.values(appliedPaint).map((p) => p.colorHex))].slice(
        -8,
      ),
    [appliedPaint],
  );
  const mapCount =
    paintSelection.kind === "parts"
      ? paintSelection.textures.length
      : (brush.info?.textureCount ?? 0);
  const meta =
    paintSelection.kind === "parts"
      ? t("foundry.paint.sectionsMeta", { count: mapCount })
      : t("foundry.paint.coverage", { count: coverage(brush.info) });
  const applyLabel =
    paintSelection.kind === "parts" && paintSelection.textures.length > 1
      ? t("foundry.paint.applySections", {
          count: paintSelection.textures.length,
        })
      : t("foundry.paint.apply", { target: title });
  const hero = manifest?.heroDisplay ?? manifest?.hero ?? null;

  if (brush.nothingSelected) {
    return (
      <div className='flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center'>
        <PaintBrushIcon
          className='h-8 w-8 text-muted-foreground/50'
          weight='duotone'
        />
        <p className='font-medium text-sm'>{t("foundry.paint.emptyTitle")}</p>
        <p className='text-muted-foreground text-xs'>
          {t("foundry.paint.emptyHint")}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className='flex shrink-0 items-center gap-2 border-b px-4 py-3.5'>
        <Swatch className='h-7 w-7 rounded-md' color={paint.colorHex} />
        <div className='min-w-0 flex-1'>
          <p className='truncate font-semibold text-[13px]'>{title}</p>
          <p className='truncate text-[11px] text-muted-foreground'>{meta}</p>
        </div>
        <Button
          className='h-7 px-2 text-xs'
          disabled={!brush.hasDraft}
          icon={<ArrowCounterClockwiseIcon className='h-3.5 w-3.5' />}
          onClick={brush.resetDraft}
          size='sm'
          variant='ghost'>
          {t("foundry.paint.reset")}
        </Button>
      </div>

      <ScrollArea className='min-h-0 flex-1'>
        <section
          className={cn(
            "space-y-2.5 border-b px-4 py-3.5 transition-opacity",
            brush.colorIgnored && "pointer-events-none opacity-45",
          )}>
          <SectionLabel>{t("foundry.paint.colorLabel")}</SectionLabel>
          <ColorPicker
            labels={{
              hex: t("foundry.paint.hex"),
              eyedropper: t("foundry.paint.eyedropper"),
            }}
            onChange={(colorHex) => update({ colorHex })}
            value={paint.colorHex}
          />
          {palette === null ? (
            <SwatchRow label={t("foundry.paint.fromSkin")} loading />
          ) : (
            <SwatchRow
              colors={palette.length > 0 ? palette : PRESET_COLORS}
              current={paint.colorHex}
              label={t(
                palette.length > 0
                  ? "foundry.paint.fromSkin"
                  : "foundry.paint.presets",
              )}
              onPick={(colorHex) => update({ colorHex })}
            />
          )}
          {recent.length > 0 && (
            <SwatchRow
              colors={recent}
              current={paint.colorHex}
              label={t("foundry.paint.recent")}
              onPick={(colorHex) => update({ colorHex })}
            />
          )}
        </section>

        <section
          className={cn(
            "space-y-3 border-b px-4 py-3.5 transition-opacity",
            brush.colorIgnored && "pointer-events-none opacity-45",
          )}>
          <SectionLabel>{t("foundry.paint.adjustLabel")}</SectionLabel>
          <ScaleSlider
            label={t("foundry.paint.saturationLabel")}
            max={3}
            min={0}
            onChange={(saturation) => update({ saturation })}
            value={paint.saturation}
          />
          <ScaleSlider
            label={t("foundry.paint.brightnessLabel")}
            max={2}
            min={0.2}
            onChange={(brightness) => update({ brightness })}
            value={paint.brightness}
          />
        </section>

        <section className='space-y-3 px-4 py-3.5'>
          <SectionLabel
            right={
              <button
                className='font-medium text-[11px] text-muted-foreground hover:text-foreground'
                onClick={() => setAllPatterns((all) => !all)}
                type='button'>
                {allPatterns
                  ? t("foundry.paint.patternsFewer")
                  : t("foundry.paint.patternsAll", { count: 19 })}
              </button>
            }>
            {t("foundry.paint.patternLabel")}
          </SectionLabel>
          <FoundryPatternPicker
            disabled={brush.disabled}
            expanded={allPatterns}
            onChange={(pattern) => update({ pattern })}
            value={paint.pattern}
          />
          {brush.patterned && (
            <>
              <ScaleSlider
                label={t("foundry.paint.patternIntensity")}
                max={1}
                min={0}
                onChange={(patternIntensity) => update({ patternIntensity })}
                suffix=''
                value={paint.patternIntensity}
              />
              <ScaleSlider
                label={t("foundry.paint.patternPhase")}
                max={1}
                min={0}
                onChange={(patternPhase) => update({ patternPhase })}
                suffix=''
                value={paint.patternPhase}
              />
              <p className='rounded-md border border-dashed px-3 py-2 text-[11px] text-muted-foreground'>
                {t(
                  brush.colorDrivesParticlesOnly
                    ? "foundry.paint.patternOverridesColorExceptEffects"
                    : "foundry.paint.patternOverridesColor",
                )}
              </p>
            </>
          )}
        </section>
      </ScrollArea>

      <button
        className='flex shrink-0 items-center gap-2 px-4 py-2 text-left text-[11px] text-muted-foreground hover:text-foreground'
        onClick={() =>
          openUrl(heroPainterUrl(hero)).catch((err) =>
            logger
              .withError(err)
              .error("[Foundry] Could not open Hero Painter"),
          )
        }
        type='button'>
        <PenNibIcon className='h-3.5 w-3.5 shrink-0' />
        <span className='flex-1'>
          {t("foundry.paint.freehand")}{" "}
          <span className='font-semibold text-secondary-foreground'>
            {t("foundry.paint.heroPainter")}
          </span>
        </span>
        <ArrowSquareOutIcon className='h-3 w-3 shrink-0' />
      </button>

      <div className='shrink-0 space-y-2.5 border-t px-4 py-3'>
        <p className='flex items-center gap-1.5 text-[11px] text-muted-foreground'>
          <InfoIcon className='h-[13px] w-[13px] shrink-0' />
          {workspace
            ? t("foundry.paint.rewrites", { count: mapCount })
            : t("foundry.editor.workspacePending")}
        </p>
        <Button
          className='h-9 w-full font-semibold'
          disabled={brush.disabled}
          icon={<PaintBrushIcon className='h-4 w-4' />}
          isLoading={brush.applying}
          onClick={brush.apply}>
          {brush.applying ? t("foundry.preview.painting") : applyLabel}
        </Button>
      </div>
    </>
  );
};
