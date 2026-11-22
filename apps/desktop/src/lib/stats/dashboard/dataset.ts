export type FieldFormat =
  | "number"
  | "integer"
  | "decimal"
  | "percent"
  | "signedPercent"
  | "percentPoints"
  | "clock"
  | "minutes"
  | "date"
  | "hour"
  | "weekday"
  | "hero"
  | "heroList"
  | "item"
  | "badge"
  | "result"
  | "session"
  | "durationBucket"
  | "text";

export type CellValue = number | string | null;
export type DatasetRow = Record<string, CellValue>;

export interface DatasetField {
  key: string;
  format: FieldFormat;
  label?: string;
  labelKey?: string;
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

export const missingFields = (dataset: Dataset, keys: string[]): string[] =>
  keys.filter((key) => key !== "" && !fieldByKey(dataset, key));
