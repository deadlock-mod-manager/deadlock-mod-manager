import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import { ColorPicker } from "@deadlock-mods/ui/components/color-picker";
import { Label } from "@deadlock-mods/ui/components/label";
import { Separator } from "@deadlock-mods/ui/components/separator";
import { Slider } from "@deadlock-mods/ui/components/slider";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { cn } from "@deadlock-mods/ui/lib/utils";
import {
  PaintBrushIcon,
  PersonIcon,
  SparkleIcon,
  SwordIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import logger from "@/lib/logger";
import type {
  FoundryPaint,
  FoundryPaintTargetId,
  FoundryPaintTargetInfo,
} from "@/types/foundry";
import { useFoundry } from "./foundry-context";
import { FoundryPatternPicker } from "./foundry-pattern-picker";

const TARGET_ORDER: FoundryPaintTargetId[] = [
  "body",
  "weapon",
  "bodyAndWeapon",
  "abilities",
];

const TARGET_ICONS: Record<FoundryPaintTargetId, React.ReactNode> = {
  body: <PersonIcon className='h-4 w-4' weight='duotone' />,
  weapon: <SwordIcon className='h-4 w-4' weight='duotone' />,
  bodyAndWeapon: <UsersThreeIcon className='h-4 w-4' weight='duotone' />,
  abilities: <SparkleIcon className='h-4 w-4' weight='duotone' />,
};

/**
 * Starting colors, one per part, picked so the three read as a set rather than
 * unrelated hues: a warm body, a brass weapon and a violet effect color.
 */
const TARGET_DEFAULT_COLOR: Record<FoundryPaintTargetId, string> = {
  body: "#c2543f",
  weapon: "#c8963e",
  bodyAndWeapon: "#3f7fc2",
  abilities: "#8e5bd0",
};

const defaultPaint = (target: FoundryPaintTargetId): FoundryPaint => ({
  colorHex: TARGET_DEFAULT_COLOR[target],
  saturation: 1,
  brightness: 1,
  pattern: "none",
  patternIntensity: 0.7,
  patternPhase: 0,
});

const coverage = (info: FoundryPaintTargetInfo | undefined): number =>
  (info?.textureCount ?? 0) + (info?.particleCount ?? 0);

/** A multiplier slider, shown with its current value. */
const ScaleSlider = ({
  label,
  value,
  min,
  max,
  suffix = "x",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (value: number) => void;
}) => (
  <div className='space-y-1'>
    <div className='flex items-center justify-between'>
      <span className='text-muted-foreground text-xs'>{label}</span>
      <span className='font-mono text-muted-foreground text-xs tabular-nums'>
        {value.toFixed(2)}
        {suffix}
      </span>
    </div>
    <Slider
      max={max}
      min={min}
      onValueChange={([next]) => onChange(next)}
      step={0.05}
      value={[value]}
    />
  </div>
);

const TargetButton = ({
  target,
  info,
  isSelected,
  isPainted,
  onSelect,
}: {
  target: FoundryPaintTargetId;
  info: FoundryPaintTargetInfo | undefined;
  isSelected: boolean;
  isPainted: boolean;
  onSelect: () => void;
}) => {
  const { t } = useTranslation();
  const count = coverage(info);
  const empty = count === 0;

  return (
    <button
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left transition-colors",
        isSelected
          ? "border-primary bg-primary/10"
          : "border-transparent hover:bg-muted",
        empty && "pointer-events-none opacity-45",
      )}
      disabled={empty}
      onClick={onSelect}
      type='button'>
      {TARGET_ICONS[target]}
      <div className='min-w-0 flex-1'>
        <p className='truncate font-medium text-sm'>
          {t(`foundry.paint.targets.${target}`)}
        </p>
        <p className='truncate text-muted-foreground text-xs'>
          {empty
            ? t("foundry.paint.nothingToPaint")
            : t("foundry.paint.coverage", { count })}
        </p>
      </div>
      {isPainted && (
        <Badge className='shrink-0 text-[10px]'>{t("foundry.edited")}</Badge>
      )}
    </button>
  );
};

/**
 * The paint tab: pick a part of the hero, pick a color and optionally a pattern,
 * apply. Each part is a whole set of materials, so one apply repaints every
 * texture it covers — and for abilities, the particle color parameters too.
 *
 * The 3D preview tints live as the color changes, which is instant but
 * approximate; Apply bakes the real thing into the workspace and the preview
 * then re-reads the actual textures.
 */
export const FoundryPaintPanel = () => {
  const { t } = useTranslation();
  const {
    paintTargets,
    appliedPaint,
    workspace,
    busy,
    paintTarget,
    setPreviewTint,
  } = useFoundry();
  const [selected, setSelected] = useState<FoundryPaintTargetId>("body");
  const [drafts, setDrafts] = useState<
    Partial<Record<FoundryPaintTargetId, FoundryPaint>>
  >({});

  const infoById = useMemo(
    () => new Map(paintTargets.map((info) => [info.id, info])),
    [paintTargets],
  );

  const paint =
    drafts[selected] ?? appliedPaint[selected] ?? defaultPaint(selected);
  const disabled = !workspace || busy || coverage(infoById.get(selected)) === 0;

  // Whether the panel holds a change that has not been baked yet.
  const applied = appliedPaint[selected];
  const isDirty =
    !applied ||
    applied.colorHex !== paint.colorHex ||
    applied.saturation !== paint.saturation ||
    applied.brightness !== paint.brightness;

  // The shader previews the *pending* paint only. Once a part is applied its
  // real textures carry that color, so painting on top would double it and the
  // preview would stop telling the truth.
  useEffect(() => {
    setPreviewTint(
      isDirty
        ? {
            target: selected,
            colorHex: paint.colorHex,
            saturation: paint.saturation,
            brightness: paint.brightness,
          }
        : null,
    );
    return () => setPreviewTint(null);
  }, [
    isDirty,
    selected,
    paint.colorHex,
    paint.saturation,
    paint.brightness,
    setPreviewTint,
  ]);

  const update = useCallback(
    (patch: Partial<FoundryPaint>) => {
      setDrafts((current) => ({
        ...current,
        [selected]: { ...paint, ...patch },
      }));
    },
    [paint, selected],
  );

  const handleApply = useCallback(async () => {
    try {
      await paintTarget(selected, paint);
      // No success toast: the preview repaints and the target picks up its
      // "Edited" badge, which says the same thing without a popup on every
      // colour the user tries.
    } catch (err) {
      logger.withError(err).error("[Foundry] Paint failed");
      toast.error(t("foundry.paint.failed"));
    }
  }, [paint, paintTarget, selected, t]);

  return (
    <div className='space-y-4'>
      <div className='space-y-1'>
        {TARGET_ORDER.map((target) => (
          <TargetButton
            info={infoById.get(target)}
            isPainted={Boolean(appliedPaint[target])}
            isSelected={target === selected}
            key={target}
            onSelect={() => setSelected(target)}
            target={target}
          />
        ))}
      </div>

      <Separator />

      <div className='space-y-3'>
        <Label className='text-muted-foreground text-xs'>
          {t("foundry.paint.colorLabel")}
        </Label>
        <ColorPicker
          labels={{
            red: t("foundry.paint.red"),
            green: t("foundry.paint.green"),
            blue: t("foundry.paint.blue"),
            eyedropper: t("foundry.paint.eyedropper"),
          }}
          onChange={(colorHex) => update({ colorHex })}
          value={paint.colorHex}
        />

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
      </div>

      <Separator />

      <div className='space-y-3'>
        <Label className='text-muted-foreground text-xs'>
          {t("foundry.paint.patternLabel")}
        </Label>
        <FoundryPatternPicker
          disabled={disabled}
          onChange={(pattern) => update({ pattern })}
          value={paint.pattern}
        />
        {paint.pattern !== "none" && (
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
          </>
        )}
      </div>

      <Button
        className='w-full'
        disabled={disabled}
        icon={<PaintBrushIcon className='h-4 w-4' />}
        onClick={handleApply}
        size='sm'>
        {t("foundry.paint.apply", {
          target: t(`foundry.paint.targets.${selected}`),
        })}
      </Button>

      {!workspace && (
        <p className='rounded-md border border-dashed px-3 py-2 text-muted-foreground text-xs'>
          {t("foundry.editor.workspacePending")}
        </p>
      )}
      <p className='text-muted-foreground text-xs'>{t("foundry.paint.hint")}</p>
    </div>
  );
};
