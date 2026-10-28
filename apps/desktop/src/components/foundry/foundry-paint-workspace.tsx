import { Button } from "@deadlock-mods/ui/components/button";
import { ColorPicker } from "@deadlock-mods/ui/components/color-picker";
import { ScrollArea } from "@deadlock-mods/ui/components/scroll-area";
import { Slider } from "@deadlock-mods/ui/components/slider";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { cn } from "@deadlock-mods/ui/lib/utils";
import {
  ArrowCounterClockwiseIcon,
  ArrowSquareOutIcon,
  CheckIcon,
  EyeIcon,
  EyeSlashIcon,
  HandPointingIcon,
  InfoIcon,
  PaintBrushIcon,
  PenNibIcon,
  PersonIcon,
  SparkleIcon,
  SwordIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
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
import { FoundryPreview } from "./foundry-preview";
import { useSkinPalette } from "./foundry-skin-palette";

const TARGET_ORDER: FoundryPaintTargetId[] = [
  "body",
  "weapon",
  "bodyAndWeapon",
  "abilities",
];

const TARGET_ICONS = {
  body: PersonIcon,
  weapon: SwordIcon,
  bodyAndWeapon: UsersThreeIcon,
  abilities: SparkleIcon,
} satisfies Record<FoundryPaintTargetId, React.ElementType>;

/** The section groups, in the order the list shows them. */
const PART_GROUPS: FoundryPaintTargetId[] = ["body", "weapon"];

/**
 * Starting colors, one per part, picked so the set reads as a palette rather
 * than unrelated hues: a warm body, a brass weapon and a violet effect color.
 */
const TARGET_DEFAULT_COLOR = {
  body: "#c2543f",
  weapon: "#c8963e",
  bodyAndWeapon: "#3f7fc2",
  abilities: "#8e5bd0",
} satisfies Record<FoundryPaintTargetId, string>;

/** Colors offered before anything has been painted this session. */
const PRESET_COLORS = [
  "#c2543f",
  "#c8963e",
  "#3f7fc2",
  "#8e5bd0",
  "#3e8f6a",
  "#d9d2c3",
  "#2b2e3a",
  "#b23a5e",
];

const HERO_PAINTER_URL = "https://deadlockforge.net/paint/";

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

/** Forge's painter takes the hero by name, lowercased with underscores. */
const heroPainterUrl = (hero: string | null) =>
  hero
    ? `${HERO_PAINTER_URL}?hero=${encodeURIComponent(
        hero.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      )}`
    : HERO_PAINTER_URL;

/**
 * Everything the paint tab's three columns share: what is selected, the draft
 * paint for it, and whether the preview may show it.
 */
const usePaintBrush = () => {
  const { t } = useTranslation();
  const {
    paintTargets,
    appliedPaint,
    workspace,
    busy,
    paintParts,
    paintSelection,
    paintTarget,
    paintSelectedParts,
    setPreviewTint,
  } = useFoundry();
  const [drafts, setDrafts] = useState<Record<string, FoundryPaint>>({});
  // Off until the user asks for it: a color the user has not committed to must
  // not appear on the hero, and the picker always holds *some* value.
  const [previewEnabled, setPreviewEnabled] = useState(false);
  // Held down with Space to look at the hero without the pending tint.
  const [comparing, setComparing] = useState(false);

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

  const isDirty =
    !applied ||
    applied.colorHex !== paint.colorHex ||
    applied.saturation !== paint.saturation ||
    applied.brightness !== paint.brightness;

  // The hero is tinted only when the user asked for it, the paint is still
  // pending (an applied paint is already in the textures, tinting would double
  // it) and no pattern is chosen (the shader cannot generate one).
  const canPreview = isDirty && !patterned && tintTextures.length > 0;
  const showTint = previewEnabled && canPreview;

  useEffect(() => {
    setPreviewTint(
      showTint && !comparing
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
    comparing,
    tintTextures,
    paint.colorHex,
    paint.saturation,
    paint.brightness,
    setPreviewTint,
  ]);

  useEffect(() => {
    if (!showTint) return;
    const typing = (event: KeyboardEvent) =>
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement;
    const down = (event: KeyboardEvent) => {
      if (event.code !== "Space" || typing(event)) return;
      event.preventDefault();
      setComparing(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === "Space") setComparing(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      setComparing(false);
    };
  }, [showTint]);

  const update = useCallback(
    (patch: Partial<FoundryPaint>) => {
      setDrafts((current) => ({ ...current, [key]: { ...paint, ...patch } }));
    },
    [key, paint],
  );

  const resetDraft = useCallback(() => {
    setDrafts((current) => {
      const { [key]: _dropped, ...rest } = current;
      return rest;
    });
  }, [key]);

  const apply = useCallback(async () => {
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
      // left to add; leaving it on would paint the color a second time.
      setPreviewEnabled(false);
      // Targets and sections overlap, so a draft for another selection may now
      // hold a color its textures no longer wear.
      setDrafts({});
    } catch (err) {
      logger.withError(err).error("[Foundry] Paint failed");
      toast.error(t("foundry.paint.failed"));
    }
  }, [paint, paintSelectedParts, paintSelection, paintTarget, t]);

  return {
    paint,
    info,
    infoById,
    disabled,
    nothingSelected,
    patterned,
    colorDrivesParticlesOnly,
    colorIgnored,
    hasDraft: key in drafts,
    tintTextures,
    canPreview,
    previewEnabled,
    setPreviewEnabled,
    showTint,
    update,
    resetDraft,
    apply,
  };
};

type PaintBrush = ReturnType<typeof usePaintBrush>;

const SectionLabel = ({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) => (
  <div className='flex items-center gap-1.5'>
    <h3 className='font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.08em]'>
      {children}
    </h3>
    {right && <span className='ml-auto'>{right}</span>}
  </div>
);

const Swatch = ({
  color,
  className,
}: {
  color: string;
  className?: string;
}) => (
  <span
    className={cn(
      "inline-block h-3.5 w-3.5 shrink-0 rounded border border-white/15",
      className,
    )}
    style={{ backgroundColor: color }}
  />
);

const SectionRow = ({
  part,
  selected,
  hidden,
  appliedColor,
  onToggle,
  onToggleHidden,
}: {
  part: FoundryPaintPart;
  selected: boolean;
  hidden: boolean;
  appliedColor: string | undefined;
  onToggle: () => void;
  onToggleHidden: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "group flex items-center gap-2.5 rounded-md border px-2 py-[7px] transition-colors",
        selected
          ? "border-primary/25 bg-primary/[0.07]"
          : "border-transparent hover:bg-muted",
      )}>
      <button
        aria-pressed={selected}
        className='flex min-w-0 flex-1 items-center gap-2.5 text-left'
        onClick={onToggle}
        title={part.materials.join("\n")}
        type='button'>
        <span
          className={cn(
            "flex h-4 w-4 shrink-0 items-center justify-center rounded border-[1.5px]",
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/50",
          )}>
          {selected && (
            <CheckIcon className='h-[11px] w-[11px]' weight='bold' />
          )}
        </span>
        <span className='flex min-w-0 flex-col'>
          <span
            className={cn(
              "truncate text-[13px]",
              selected && "font-semibold",
              hidden && "text-muted-foreground",
            )}>
            {part.label}
          </span>
          {hidden && (
            <span className='text-[10px] text-muted-foreground/70'>
              {t("foundry.paint.hiddenMeta")}
            </span>
          )}
        </span>
      </button>
      <button
        aria-label={t(
          hidden ? "foundry.paint.showPart" : "foundry.paint.hidePart",
        )}
        className={cn(
          "shrink-0 text-muted-foreground transition-opacity hover:text-foreground",
          hidden ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
        onClick={onToggleHidden}
        title={t(hidden ? "foundry.paint.showPart" : "foundry.paint.hidePart")}
        type='button'>
        {hidden ? (
          <EyeSlashIcon className='h-[15px] w-[15px]' />
        ) : (
          <EyeIcon className='h-[15px] w-[15px]' />
        )}
      </button>
      {appliedColor && <Swatch color={appliedColor} />}
    </div>
  );
};

/** The left column: pick sections, or whole parts of the hero. */
const PaintRail = ({ brush }: { brush: PaintBrush }) => {
  const { t } = useTranslation();
  const {
    paintParts,
    paintSelection,
    setPaintSelection,
    appliedPaint,
    hiddenParts,
    toggleHiddenPart,
  } = useFoundry();
  const hasSections = paintParts.length > 0;
  // A hero without sections can only be painted part by part.
  const scope =
    paintSelection.kind === "target" || !hasSections ? "whole" : "sections";
  const selected = useMemo(
    () =>
      new Set(paintSelection.kind === "parts" ? paintSelection.textures : []),
    [paintSelection],
  );
  const groups = useMemo(
    () =>
      PART_GROUPS.map((group) => ({
        group,
        parts: paintParts.filter((part) => part.target === group),
      })).filter(({ parts }) => parts.length > 0),
    [paintParts],
  );

  const toggle = (texture: string) => {
    const next = selected.has(texture)
      ? [...selected].filter((entry) => entry !== texture)
      : [...selected, texture];
    setPaintSelection({ kind: "parts", textures: next });
  };
  const selectAll = (parts: FoundryPaintPart[]) =>
    setPaintSelection({
      kind: "parts",
      textures: [
        ...new Set([...selected, ...parts.map((part) => part.texture)]),
      ],
    });

  return (
    <>
      <div className='shrink-0 space-y-2.5 border-b p-3.5 pb-3'>
        <h2 className='font-semibold text-[13px]'>
          {t("foundry.paint.whatToPaint")}
        </h2>
        {hasSections && (
          <div
            className='flex gap-0.5 rounded-[7px] border bg-background p-[3px]'
            role='tablist'>
            {(["sections", "whole"] as const).map((option) => (
              <button
                aria-selected={scope === option}
                className={cn(
                  "flex-1 rounded-[5px] px-2 py-[5px] font-medium text-xs transition-colors",
                  scope === option
                    ? "bg-secondary font-semibold text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                key={option}
                onClick={() =>
                  setPaintSelection(
                    option === "whole"
                      ? { kind: "target", target: "body" }
                      : { kind: "parts", textures: [] },
                  )
                }
                role='tab'
                type='button'>
                {t(`foundry.paint.scope.${option}`)}
              </button>
            ))}
          </div>
        )}
        {scope === "sections" && (
          <p className='flex items-start gap-1.5 text-[11px] text-muted-foreground leading-[1.4]'>
            <HandPointingIcon className='mt-px h-[13px] w-[13px] shrink-0' />
            {t("foundry.paint.railPickHint")}
          </p>
        )}
      </div>

      <ScrollArea className='min-h-0 flex-1'>
        <div className='space-y-3.5 p-2'>
          {scope === "sections" ? (
            <>
              {groups.map(({ group, parts }) => (
                <section className='space-y-0.5' key={group}>
                  <div className='flex items-center gap-1.5 px-1.5 pb-1'>
                    <h3 className='font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.08em]'>
                      {t(`foundry.paint.targets.${group}`)}
                    </h3>
                    <span className='font-mono text-[10px] text-muted-foreground/60'>
                      {parts.length}
                    </span>
                    <button
                      className='ml-auto font-medium text-[11px] text-muted-foreground hover:text-foreground'
                      onClick={() => selectAll(parts)}
                      type='button'>
                      {t("foundry.paint.selectAll")}
                    </button>
                  </div>
                  {parts.map((part) => (
                    <SectionRow
                      appliedColor={
                        appliedPaint[partPaintKey(part.texture)]?.colorHex
                      }
                      hidden={hiddenParts.includes(part.texture)}
                      key={part.texture}
                      onToggle={() => toggle(part.texture)}
                      onToggleHidden={() => toggleHiddenPart(part.texture)}
                      part={part}
                      selected={selected.has(part.texture)}
                    />
                  ))}
                </section>
              ))}
              <div className='flex items-center gap-2 rounded-md border px-2.5 py-[9px]'>
                <SparkleIcon className='h-[15px] w-[15px] shrink-0 text-muted-foreground' />
                <p className='text-[11px] text-muted-foreground leading-[1.4]'>
                  {t("foundry.paint.effectsNote")}{" "}
                  <button
                    className='font-medium text-foreground underline-offset-2 hover:underline'
                    onClick={() =>
                      setPaintSelection({ kind: "target", target: "abilities" })
                    }
                    type='button'>
                    {t("foundry.paint.effectsSwitch")}
                  </button>
                </p>
              </div>
            </>
          ) : (
            <div className='space-y-0.5'>
              {TARGET_ORDER.map((target) => {
                const Icon = TARGET_ICONS[target];
                const count = coverage(brush.infoById.get(target));
                const active =
                  paintSelection.kind === "target" &&
                  paintSelection.target === target;
                const color = appliedPaint[targetPaintKey(target)]?.colorHex;
                return (
                  <button
                    aria-pressed={active}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors",
                      active
                        ? "border-primary/25 bg-primary/[0.07]"
                        : "border-transparent hover:bg-muted",
                      count === 0 && "pointer-events-none opacity-45",
                    )}
                    disabled={count === 0}
                    key={target}
                    onClick={() =>
                      setPaintSelection({ kind: "target", target })
                    }
                    type='button'>
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        active ? "text-primary" : "text-muted-foreground",
                      )}
                      weight='duotone'
                    />
                    <span className='min-w-0 flex-1'>
                      <span
                        className={cn(
                          "block truncate text-[13px]",
                          active && "font-semibold",
                        )}>
                        {t(`foundry.paint.targets.${target}`)}
                      </span>
                      <span className='block truncate text-[11px] text-muted-foreground'>
                        {count === 0
                          ? t("foundry.paint.nothingToPaint")
                          : t("foundry.paint.coverage", { count })}
                      </span>
                    </span>
                    {color && <Swatch color={color} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>

      {scope === "sections" && (
        <div className='flex shrink-0 items-center gap-2 border-t px-3.5 py-2.5 text-xs'>
          <span className={cn(selected.size === 0 && "text-muted-foreground")}>
            {selected.size > 0
              ? t("foundry.paint.selectedCount", { count: selected.size })
              : t("foundry.paint.nothingSelected")}
          </span>
          {selected.size > 0 && (
            <button
              className='ml-auto font-medium text-muted-foreground hover:text-foreground'
              onClick={() => setPaintSelection({ kind: "parts", textures: [] })}
              type='button'>
              {t("foundry.paint.clearSelection")}
            </button>
          )}
        </div>
      )}
    </>
  );
};

const SwatchRow = ({
  label,
  colors = [],
  current,
  loading,
  onPick,
}: {
  label: string;
  colors?: readonly string[];
  current?: string;
  loading?: boolean;
  onPick?: (color: string) => void;
}) => (
  <div className='space-y-1.5'>
    <p className='text-[11px] text-muted-foreground'>{label}</p>
    <div className='flex flex-wrap gap-1.5'>
      {loading
        ? ["a", "b", "c", "d", "e", "f"].map((slot) => (
            <span
              className='h-6 w-6 animate-pulse rounded-[5px] bg-muted'
              key={slot}
            />
          ))
        : colors.map((color) => (
            <button
              aria-label={color}
              className={cn(
                "h-6 w-6 rounded-[5px] border border-white/10 transition-transform hover:scale-110",
                color === current &&
                  "ring-2 ring-primary ring-offset-1 ring-offset-card",
              )}
              key={color}
              onClick={() => onPick?.(color)}
              style={{ backgroundColor: color }}
              title={color}
              type='button'
            />
          ))}
    </div>
  </div>
);

/** What the brush is pointed at, for the brush header and the apply button. */
const useSelectionTitle = () => {
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

const ScaleSlider = ({
  label,
  value,
  min,
  max,
  suffix = "×",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (value: number) => void;
}) => (
  <div className='space-y-1.5'>
    <div className='flex items-center justify-between'>
      <span className='text-xs'>{label}</span>
      <span className='font-mono text-[11px] text-muted-foreground tabular-nums'>
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

/** The right column: color, adjustments and pattern, then Paint. */
const BrushPanel = ({ brush }: { brush: PaintBrush }) => {
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
          onClick={brush.apply}>
          {applyLabel}
        </Button>
      </div>
    </>
  );
};

/** The live-preview switch over the viewport, and the compare hint above the dock. */
const PreviewOverlay = ({ brush }: { brush: PaintBrush }) => {
  const { t } = useTranslation();
  const title = useSelectionTitle();
  if (brush.nothingSelected) return null;

  return (
    <>
      <div className='pointer-events-none absolute inset-x-0 top-[62px] flex justify-center'>
        <label
          className='pointer-events-auto flex items-center gap-2.5 rounded-full border bg-card/90 py-1.5 pr-2 pl-3 text-xs backdrop-blur-md'
          title={t(
            brush.patterned
              ? "foundry.paint.previewUnavailable"
              : "foundry.paint.previewHint",
          )}>
          <span
            className={cn(
              "h-[7px] w-[7px] rounded-full",
              brush.showTint ? "bg-orange-400" : "bg-muted-foreground/50",
            )}
          />
          <span className='max-w-64 truncate font-medium'>
            {brush.patterned
              ? t("foundry.paint.previewUnavailableShort")
              : t("foundry.paint.previewOn", { target: title })}
          </span>
          <Switch
            checked={brush.previewEnabled && brush.canPreview}
            disabled={!brush.canPreview}
            onCheckedChange={brush.setPreviewEnabled}
          />
        </label>
      </div>
      {brush.showTint && (
        <div className='pointer-events-none absolute inset-x-0 bottom-[124px] flex justify-center'>
          <p className='flex items-center gap-2 rounded-[7px] border bg-card/90 py-[5px] pr-2.5 pl-1.5 text-[11px] text-muted-foreground backdrop-blur-md'>
            <kbd className='rounded border border-white/10 bg-muted px-[7px] py-0.5 font-mono font-semibold text-[10px] text-foreground'>
              {t("foundry.paint.spaceKey")}
            </kbd>
            {t("foundry.paint.compare")}
          </p>
        </div>
      )}
    </>
  );
};

/**
 * The paint tab: sections on the left, the hero in the middle, the brush on
 * the right. A section is one color map, so painting it rewrites exactly that
 * map; a whole part repaints every texture it covers, and for abilities the
 * particle colors too.
 *
 * The preview tints live as the color changes, which is instant but
 * approximate; Paint bakes the real thing into the workspace and the preview
 * then re-reads the actual textures.
 */
export const FoundryPaintWorkspace = ({
  sidePanelClassName,
}: {
  sidePanelClassName: string;
}) => {
  const brush = usePaintBrush();
  return (
    <>
      <div className={cn(sidePanelClassName, "w-[248px] border-r")}>
        <PaintRail brush={brush} />
      </div>
      <div className='relative min-w-0 flex-1'>
        <FoundryPreview />
        <PreviewOverlay brush={brush} />
      </div>
      <div className={cn(sidePanelClassName, "w-[292px] border-l")}>
        <BrushPanel brush={brush} />
      </div>
    </>
  );
};
