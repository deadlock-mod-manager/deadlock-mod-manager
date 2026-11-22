/**
 * What every widget source resolves to: flat rows plus a description of their
 * fields. Charts only ever see this shape, so a preset, a match query and a raw
 * API response all render through the same code.
 */

export type FieldFormat =
  | "number"
  | "integer"
  | "decimal"
  /** A fraction, 0.53 renders as 53%. */
  | "percent"
  | "signedPercent"
  /** Already in percent, 53 renders as 53%. */
  | "percentPoints"
  /** Seconds, rendered as m:ss. */
  | "clock"
  | "minutes"
  /** Unix seconds. */
  | "date"
  | "hour"
  | "weekday"
  | "hero"
  /** Comma-separated hero ids, e.g. a duo. */
  | "heroList"
  | "item"
  /** Valve's packed rank badge, e.g. 91. */
  | "badge"
  /** 1 for a win, 0 for a loss. */
  | "result"
  /** Position of a match within a play session. */
  | "session"
  /** Start of a five-minute match-length bucket, in minutes. */
  | "durationBucket"
  | "text";

export type CellValue = number | string | null;
export type DatasetRow = Record<string, CellValue>;

export interface DatasetField {
  key: string;
  format: FieldFormat;
  /** Literal display name, for fields straight from an API response. */
  label?: string;
  /** i18n key for the display name, when it depends on a preset parameter. */
  labelKey?: string;
  /** i18n prefix that turns raw text values (API enum keys) into labels. */
  valueLabels?: string;
}

export interface Dataset {
  fields: DatasetField[];
  rows: DatasetRow[];
}

const CATEGORY_FORMATS: ReadonlySet<FieldFormat> = new Set([
  "text",
  "hero",
  "heroList",
  "item",
  "date",
  "hour",
  "weekday",
  "badge",
  "result",
  "session",
  "durationBucket",
]);

/** Whether a field reads as a label (an axis category) rather than a value. */
export const isCategoryField = (field: DatasetField): boolean =>
  CATEGORY_FORMATS.has(field.format);

export const isNumericField = (field: DatasetField): boolean =>
  field.format !== "text" && field.format !== "heroList";

export const numericValue = (value: CellValue | undefined): number | null =>
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Numeric chart values must exclude text cells without coercing numeric strings.
  typeof value === "number" && Number.isFinite(value) ? value : null;

export const fieldByKey = (
  dataset: Dataset,
  key: string,
): DatasetField | undefined =>
  dataset.fields.find((field) => field.key === key);

/** Fields a view references that the data no longer carries. */
export const missingFields = (dataset: Dataset, keys: string[]): string[] =>
  keys.filter((key) => key !== "" && !fieldByKey(dataset, key));
