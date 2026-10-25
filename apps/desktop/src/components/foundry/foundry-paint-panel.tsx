import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import { ColorPicker } from "@deadlock-mods/ui/components/color-picker";
import { Label } from "@deadlock-mods/ui/components/label";
import { Separator } from "@deadlock-mods/ui/components/separator";
import { Slider } from "@deadlock-mods/ui/components/slider";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { cn } from "@deadlock-mods/ui/lib/utils";
import {
  CursorClickIcon,
  EyeIcon,
  EyeSlashIcon,
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
  FoundryPaintPart,
  FoundryPaintSelection,
  FoundryPaintTargetId,
  FoundryPaintTargetInfo,
} from "@/types/foundry";
import {
  partPaintKey,
  selectionTextures,
  targetPaintKey,
  useFoundry,
} from "./foundry-context";
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

/** The section groups, in the order the list shows them. */
const PART_GROUPS: FoundryPaintTargetId[] = ["body", "weapon"];

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

/** One draft per selection: a target, a section, or a set of sections. */
const selectionKey = (selection: FoundryPaintSelection): string =>
  selection.kind === "target"
    ? targetPaintKey(selection.target)
    : selection.textures.length === 1
      ? partPaintKey(selection.textures[0])
      : `parts:${[...selection.textures].sort().join("|")}`;

const samePaint = (a: FoundryPaint, b: FoundryPaint) =>
  a.colorHex === b.colorHex &&
  a.saturation === b.saturation &&
  a.brightness === b.brightness &&
  a.pattern === b.pattern &&
  a.patternIntensity === b.patternIntensity &&
  a.patternPhase === b.patternPhase;

/** The paint a selection last had applied, when all of it shares one. */
const appliedFor = (
  selection: FoundryPaintSelection,
  applied: Readonly<Record<string, FoundryPaint>>,
): FoundryPaint | undefined => {
  if (selection.kind === "target") {
    return applied[targetPaintKey(selection.target)];
  }
  const paints = selection.textures.map(
    (texture) => applied[partPaintKey(texture)],
  );
  const [first] = paints;
  return first && paints.every((paint) => paint && samePaint(paint, first))
    ? first
    : undefined;
};

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

const PartRow = ({
  part,
  isSelected,
  isEdited,
  onSelect,
}: {
  part: FoundryPaintPart;
  isSelected: boolean;
  isEdited: boolean;
  onSelect: (additive: boolean) => void;
}) => {
  const { t } = useTranslation();
  return (
    <button
      aria-pressed={isSelected}
      className={cn(
        "flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors",
        isSelected
          ? "border-primary bg-primary/10"
          : "border-transparent hover:bg-muted",
      )}
      onClick={(event) => onSelect(event.shiftKey || event.ctrlKey)}
      title={part.materials.join("\n")}
      type='button'>
      <span
        aria-hidden
        className={cn(
          "h-2 w-2 shrink-0 rounded-full border",
          isSelected ? "border-primary bg-primary" : "border-muted-foreground",
        )}
      />
      <span className='min-w-0 flex-1 truncate'>{part.label}</span>
      {isEdited && (
        <Badge className='shrink-0 text-[10px]'>{t("foundry.edited")}</Badge>
      )}
    </button>
  );
};

/**
 * The paint tab: pick what to paint, pick a color and optionally a pattern,
 * apply.
 *
 * What to paint is either a whole part of the hero (body, weapon, both, the
 * ability effects) or individual sections of the model — the coat, the hair,
 * the gun's glass — picked from the list or by clicking the model. A part
 * repaints every texture it covers, and for abilities the particle color
 * parameters too; a section is one color map, so painting it rewrites exactly
 * that map.
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
    editedPaths,
    busy,
    paintParts,
    paintSelection,
    setPaintSelection,
    togglePaintPart,
    paintTarget,
    paintSelectedParts,
    setPreviewTint,
  } = useFoundry();
  const [drafts, setDrafts] = useState<Record<string, FoundryPaint>>({});
  // Off until the user asks for it. A color the user has not committed to must
  // not appear on the hero: the picker always holds *some* value, so tinting
  // whenever it differs from what is baked meant a freshly opened skin was
  // already wearing the default color.
  const [previewEnabled, setPreviewEnabled] = useState(false);

  const infoById = useMemo(
    () => new Map(paintTargets.map((info) => [info.id, info])),
    [paintTargets],
  );

  const key = selectionKey(paintSelection);
  const applied = appliedFor(paintSelection, appliedPaint);
  const paint =
    drafts[key] ??
    applied ??
    defaultPaint(
      paintSelection.kind === "target" ? paintSelection.target : "body",
    );
  const info =
    paintSelection.kind === "target"
      ? infoById.get(paintSelection.target)
      : undefined;
  const nothingSelected =
    paintSelection.kind === "target"
      ? coverage(info) === 0
      : paintSelection.textures.length === 0;
  const disabled = !workspace || busy || nothingSelected;
  const selectedTextures = useMemo(
    () =>
      new Set(paintSelection.kind === "parts" ? paintSelection.textures : []),
    [paintSelection],
  );
  const tintTextures = useMemo(
    () => selectionTextures(paintSelection, paintParts),
    [paintSelection, paintParts],
  );

  // A pattern carries its own palette and replaces the picked color on every
  // texture it covers. Particles are the one thing it cannot cover, so for
  // abilities the color still does something and the controls stay live.
  const patterned = paint.pattern !== "none";
  const colorDrivesParticlesOnly = patterned && (info?.particleCount ?? 0) > 0;
  const colorIgnored = patterned && !colorDrivesParticlesOnly;

  // Whether the panel holds a change that has not been baked yet.
  const isDirty =
    !applied ||
    applied.colorHex !== paint.colorHex ||
    applied.saturation !== paint.saturation ||
    applied.brightness !== paint.brightness;

  // Three things all have to hold before the hero is tinted, and each rules out
  // a way the preview could lie:
  //  - the user asked for it, so an untouched skin shows its real colors;
  //  - the paint is *pending*, because once applied the real textures carry it
  //    and tinting on top would double it;
  //  - no pattern is chosen, because the shader cannot generate one and would
  //    show a hue the bake is about to discard.
  const showTint =
    previewEnabled && isDirty && !patterned && tintTextures.length > 0;

  useEffect(() => {
    setPreviewTint(
      showTint
        ? {
            textures: tintTextures,
            colorHex: paint.colorHex,
            saturation: paint.saturation,
            brightness: paint.brightness,
          }
        : null,
    );
    return () => setPreviewTint(null);
  }, [
    showTint,
    tintTextures,
    paint.colorHex,
    paint.saturation,
    paint.brightness,
    setPreviewTint,
  ]);

  const update = useCallback(
    (patch: Partial<FoundryPaint>) => {
      setDrafts((current) => ({
        ...current,
        [key]: { ...paint, ...patch },
      }));
    },
    [key, paint],
  );

  const handleApply = useCallback(async () => {
    try {
      if (paintSelection.kind === "target") {
        await paintTarget(paintSelection.target, paint);
      } else {
        const result = await paintSelectedParts(paintSelection.textures, paint);
        if (result.skippedPaths.length > 0) {
          toast.error(
            t("foundry.paint.partsSkipped", {
              count: result.skippedPaths.length,
            }),
          );
        }
      }
      // The baked textures are the truth now, so the scene tint has nothing
      // left to add — leaving it on would paint the color a second time.
      setPreviewEnabled(false);
      // Targets and sections overlap, so a draft for another selection may now
      // hold a color its textures no longer wear.
      setDrafts({});
      // No success toast: the preview repaints and the target picks up its
      // "Edited" badge, which says the same thing without a popup on every
      // colour the user tries.
    } catch (err) {
      logger.withError(err).error("[Foundry] Paint failed");
      toast.error(t("foundry.paint.failed"));
    }
  }, [paint, paintSelectedParts, paintSelection, paintTarget, t]);

  const partsByGroup = useMemo(
    () =>
      PART_GROUPS.map((group) => ({
        group,
        parts: paintParts.filter((part) => part.target === group),
      })).filter(({ parts }) => parts.length > 0),
    [paintParts],
  );

  const applyLabel =
    paintSelection.kind === "target"
      ? t("foundry.paint.apply", {
          target: t(`foundry.paint.targets.${paintSelection.target}`),
        })
      : paintSelection.textures.length === 1
        ? t("foundry.paint.apply", {
            target:
              paintParts.find(
                (part) => part.texture === paintSelection.textures[0],
              )?.label ?? "",
          })
        : t("foundry.paint.applySections", {
            count: paintSelection.textures.length,
          });

  return (
    <div className='space-y-4'>
      <div className='space-y-1'>
        {TARGET_ORDER.map((target) => (
          <TargetButton
            info={infoById.get(target)}
            isPainted={Boolean(appliedPaint[targetPaintKey(target)])}
            isSelected={
              paintSelection.kind === "target" &&
              paintSelection.target === target
            }
            key={target}
            onSelect={() => setPaintSelection({ kind: "target", target })}
            target={target}
          />
        ))}
      </div>

      {partsByGroup.length > 0 && (
        <div className='space-y-2'>
          <div className='flex items-center justify-between gap-2'>
            <Label className='text-muted-foreground text-xs'>
              {t("foundry.paint.sectionsLabel")}
            </Label>
            {paintSelection.kind === "parts" && (
              <Button
                className='h-6 px-2 text-xs'
                onClick={() =>
                  setPaintSelection({ kind: "target", target: "body" })
                }
                size='sm'
                variant='ghost'>
                {t("foundry.paint.clearSelection")}
              </Button>
            )}
          </div>
          <p className='flex items-center gap-1.5 text-muted-foreground text-xs'>
            <CursorClickIcon className='h-3.5 w-3.5 shrink-0' />
            {t("foundry.paint.sectionsHint")}
          </p>
          {partsByGroup.map(({ group, parts }) => (
            <div className='space-y-0.5' key={group}>
              <p className='px-1 font-semibold text-[10px] text-muted-foreground uppercase tracking-wider'>
                {t(`foundry.paint.targets.${group}`)}
              </p>
              {parts.map((part) => (
                <PartRow
                  isEdited={editedPaths.has(part.texture)}
                  isSelected={selectedTextures.has(part.texture)}
                  key={part.texture}
                  onSelect={(additive) =>
                    togglePaintPart(part.texture, additive)
                  }
                  part={part}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      <Separator />

      <div
        className={cn(
          "space-y-3 transition-opacity",
          colorIgnored && "pointer-events-none opacity-45",
        )}>
        <div className='flex items-center justify-between gap-2'>
          <Label className='text-muted-foreground text-xs'>
            {t("foundry.paint.colorLabel")}
          </Label>
          <Button
            className='h-7 gap-1.5 px-2 text-xs'
            disabled={disabled || patterned}
            onClick={() => setPreviewEnabled((on) => !on)}
            size='sm'
            title={t(
              patterned
                ? "foundry.paint.previewUnavailable"
                : "foundry.paint.previewHint",
            )}
            variant={previewEnabled ? "secondary" : "ghost"}>
            {previewEnabled ? (
              <EyeIcon className='h-3.5 w-3.5' weight='fill' />
            ) : (
              <EyeSlashIcon className='h-3.5 w-3.5' />
            )}
            {t("foundry.paint.preview")}
          </Button>
        </div>
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

      {patterned && (
        <p className='rounded-md border border-dashed px-3 py-2 text-muted-foreground text-xs'>
          {t(
            colorDrivesParticlesOnly
              ? "foundry.paint.patternOverridesColorExceptEffects"
              : "foundry.paint.patternOverridesColor",
          )}
        </p>
      )}

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

      {!workspace && (
        <p className='rounded-md border border-dashed px-3 py-2 text-muted-foreground text-xs'>
          {t("foundry.editor.workspacePending")}
        </p>
      )}
      <p className='text-muted-foreground text-xs'>{t("foundry.paint.hint")}</p>

      <div className='sticky bottom-0 -mx-2 -mb-2 border-t bg-background p-2'>
        <Button
          className='w-full'
          disabled={disabled}
          icon={<PaintBrushIcon className='h-4 w-4' />}
          onClick={handleApply}
          size='sm'>
          {applyLabel}
        </Button>
      </div>
    </div>
  );
};
