import type { ConvarKind } from "@/types/generated/ConvarKind";
import type { ConvarMeta } from "@/types/generated/ConvarMeta";

type ControlKind = "switch" | "slider" | "number" | "select" | "text";

export type NumericKind = Extract<ConvarKind, "int" | "float">;

type NumberParse =
  | { ok: true; value: number }
  | { ok: false; error: "empty" | "notANumber" | "notAnInteger" };

type RangeCheck =
  | { within: true }
  | { within: false; bound: "min" | "max"; limit: number };

/** A value as the reference column shows it. */
type ValueDisplay =
  | { kind: "bool"; on: boolean }
  | { kind: "enum"; label: string }
  | { kind: "raw"; text: string };

type RangeMeta = Pick<ConvarMeta, "min" | "max">;
type StepMeta = Pick<ConvarMeta, "kind" | "step" | "min" | "max">;

const NUMBER_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;
const BOOL_WORD_PATTERN = /^(true|false)$/i;
const FLOAT_DECIMALS = 6;
/** Above this many positions a slider is too coarse to be useful; the number input alone is clearer. */
const MAX_SLIDER_POSITIONS = 10_000;

const isNumericKind = (kind: ConvarKind): kind is NumericKind =>
  kind === "int" || kind === "float";

/** Reads the forms Source 2 accepts for a bool convar: 0/1 and true/false. */
export const parseBool = (value: string): boolean | null => {
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true") return true;
  if (normalized === "0" || normalized === "false") return false;
  return null;
};

/** Writes a bool in the config's own style: words if it used words, digits otherwise. */
export const formatBool = (on: boolean, styleOf: string | null): string => {
  if (styleOf !== null && BOOL_WORD_PATTERN.test(styleOf.trim())) {
    return on ? "true" : "false";
  }
  return on ? "1" : "0";
};

export const parseNumber = (text: string, kind: NumericKind): NumberParse => {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: false, error: "empty" };
  if (!NUMBER_PATTERN.test(trimmed)) return { ok: false, error: "notANumber" };
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { ok: false, error: "notANumber" };
  if (kind === "int" && !Number.isInteger(value)) {
    return { ok: false, error: "notAnInteger" };
  }
  return { ok: true, value };
};

export const formatNumber = (value: number, kind: NumericKind): string => {
  if (kind === "int") return String(Math.round(value));
  return String(Number(value.toFixed(FLOAT_DECIMALS)));
};

export const numericStep = (meta: StepMeta): number => {
  if (meta.step !== null && meta.step > 0) return meta.step;
  if (meta.kind === "int") return 1;
  if (meta.min !== null && meta.max !== null && meta.max > meta.min) {
    // About a hundred stops across the range, on a power of ten.
    return Math.min(
      1,
      10 ** Math.floor(Math.log10((meta.max - meta.min) / 100)),
    );
  }
  return 0.01;
};

const hasSliderRange = (meta: StepMeta): boolean => {
  if (meta.min === null || meta.max === null || meta.max <= meta.min) {
    return false;
  }
  return (meta.max - meta.min) / numericStep(meta) <= MAX_SLIDER_POSITIONS;
};

export const checkRange = (value: number, meta: RangeMeta): RangeCheck => {
  if (meta.min !== null && value < meta.min) {
    return { within: false, bound: "min", limit: meta.min };
  }
  if (meta.max !== null && value > meta.max) {
    return { within: false, bound: "max", limit: meta.max };
  }
  return { within: true };
};

export const clampToRange = (value: number, meta: RangeMeta): number => {
  const range = checkRange(value, meta);
  return range.within ? value : range.limit;
};

const isNumericText = (value: string) =>
  NUMBER_PATTERN.test(value.trim()) && Number.isFinite(Number(value));

/**
 * The control for an entry. Values that don't fit the convar's kind fall back
 * to a text input so the user can still see and fix them.
 */
export const controlKind = (
  meta: ConvarMeta | null,
  value: string | null,
): ControlKind => {
  if (meta === null) return "text";
  if (meta.enumValues.length > 0) return "select";
  if (meta.kind === "bool") {
    return value === null || parseBool(value) !== null ? "switch" : "text";
  }
  if (isNumericKind(meta.kind)) {
    if (value !== null && !isNumericText(value)) return "text";
    return hasSliderRange(meta) ? "slider" : "number";
  }
  return "text";
};

/** Whether two values mean the same thing for this kind ("1" and "true", "2" and "2.0"). */
export const sameValue = (
  a: string,
  b: string,
  kind: ConvarKind | null,
): boolean => {
  if (a === b) return true;
  if (kind === "bool") {
    const left = parseBool(a);
    return left !== null && left === parseBool(b);
  }
  if (kind !== null && isNumericKind(kind)) {
    return isNumericText(a) && isNumericText(b) && Number(a) === Number(b);
  }
  return a.trim() === b.trim();
};

export const describeValue = (
  value: string,
  meta: ConvarMeta | null,
): ValueDisplay => {
  if (meta === null) return { kind: "raw", text: value };
  const enumValue = meta.enumValues.find((option) =>
    sameValue(option.value, value, "int"),
  );
  if (enumValue) return { kind: "enum", label: enumValue.label };
  if (meta.kind === "bool") {
    const on = parseBool(value);
    if (on !== null) return { kind: "bool", on };
  }
  return { kind: "raw", text: value };
};

/** Starting value for a convar the user adds: its code default, or the closest sensible value. */
export const initialValueFor = (meta: ConvarMeta): string => {
  if (meta.default !== null) return meta.default;
  if (meta.enumValues.length > 0) return meta.enumValues[0].value;
  if (meta.kind === "bool") return "0";
  if (isNumericKind(meta.kind)) {
    return formatNumber(clampToRange(0, meta), meta.kind);
  }
  return "";
};

export const isConvarPath = (path: string[]) =>
  path[0]?.toLowerCase() === "convars";

/** The key as the config writes it: `r_ssao`, `rate/max`, or `SceneSystem/CSMCascadeResolution`. */
export const entryKeyLabel = (path: string[]): string =>
  (isConvarPath(path) ? path.slice(1) : path).join("/");
