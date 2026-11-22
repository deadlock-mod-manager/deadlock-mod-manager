import {
  PersonIcon,
  SparkleIcon,
  SwordIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import type {
  FoundryPaint,
  FoundryPaintPart,
  FoundryPaintSelection,
  FoundryPaintTargetId,
  FoundryPaintTargetInfo,
} from "@/types/foundry";
import type { FoundryPreviewTint } from "./foundry-model-viewer";
import {
  partPaintKey,
  selectionTextures,
  targetPaintKey,
} from "./foundry-context";

export const TARGET_ORDER: FoundryPaintTargetId[] = [
  "body",
  "weapon",
  "bodyAndWeapon",
  "abilities",
];

export const TARGET_ICONS = {
  body: PersonIcon,
  weapon: SwordIcon,
  bodyAndWeapon: UsersThreeIcon,
  abilities: SparkleIcon,
} satisfies Record<FoundryPaintTargetId, React.ElementType>;

/** The section groups, in the order the list shows them. */
export const PART_GROUPS: FoundryPaintTargetId[] = ["body", "weapon"];

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
export const PRESET_COLORS = [
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

export const defaultPaint = (target: FoundryPaintTargetId): FoundryPaint => ({
  colorHex: TARGET_DEFAULT_COLOR[target],
  saturation: 1,
  brightness: 1,
  pattern: "none",
  patternIntensity: 0.7,
  patternPhase: 0,
});

export const coverage = (info: FoundryPaintTargetInfo | undefined): number =>
  (info?.textureCount ?? 0) + (info?.particleCount ?? 0);

/** One draft per selection: a target, a section, or a set of sections. */
export const selectionKey = (selection: FoundryPaintSelection): string =>
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
export const appliedFor = (
  selection: FoundryPaintSelection,
  applied: Readonly<Record<string, FoundryPaint>>,
  parts: readonly FoundryPaintPart[],
): FoundryPaint | undefined => {
  // A reopened workspace only knows each section's paint, so a whole part
  // reads as painted when all of its sections share one.
  if (selection.kind === "target") {
    const target = applied[targetPaintKey(selection.target)];
    if (target) return target;
  }
  const paints = selectionTextures(selection, parts).map(
    (texture) => applied[partPaintKey(texture)],
  );
  const [first] = paints;
  return first && paints.every((paint) => paint && samePaint(paint, first))
    ? first
    : undefined;
};

/** The color an apply would change, ignoring patterns the shader can't show. */
export const isPendingColor = (
  paint: FoundryPaint,
  applied: FoundryPaint | undefined,
) =>
  !applied ||
  applied.colorHex !== paint.colorHex ||
  applied.saturation !== paint.saturation ||
  applied.brightness !== paint.brightness;

export const tintLayer = (
  textures: readonly string[],
  paint: FoundryPaint,
): FoundryPreviewTint => ({
  textures,
  colorHex: paint.colorHex,
  saturation: paint.saturation,
  brightness: paint.brightness,
});

/** Forge's painter takes the hero by name, lowercased with underscores. */
export const heroPainterUrl = (hero: string | null) =>
  hero
    ? `${HERO_PAINTER_URL}?hero=${encodeURIComponent(
        hero.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      )}`
    : HERO_PAINTER_URL;
