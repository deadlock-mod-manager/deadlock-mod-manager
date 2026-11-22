import {
  type Dataset,
  type DatasetRow,
  fieldByKey,
  numericValue,
} from "./dataset";
import type { KpiReducer, WidgetView } from "./layout";

const TIME_FORMATS = new Set(["date", "hour", "weekday", "session"]);

/** Whether the x axis runs through time, where "the newest N" beats "the first N". */
export const hasTimeAxis = (dataset: Dataset, view: WidgetView): boolean => {
  const axis = fieldByKey(dataset, view.x);
  return axis !== undefined && TIME_FORMATS.has(axis.format);
};

export const compareCells = (
  a: DatasetRow[string] | undefined,
  b: DatasetRow[string] | undefined,
  direction: 1 | -1 = 1,
) => {
  const left = numericValue(a);
  const right = numericValue(b);
  if (left !== null && right !== null) {
    return direction * (left - right);
  }
  if (left === null && right === null) {
    return direction * String(a ?? "").localeCompare(String(b ?? ""));
  }
  // Missing values sink to the end whichever way the sort runs.
  return left === null ? 1 : -1;
};

/** Sort, then cut to `limit`. Time series keep their order and their newest rows. */
export const prepareRows = (
  dataset: Dataset,
  view: WidgetView,
): DatasetRow[] => {
  let rows = dataset.rows;
  if (view.sortBy && fieldByKey(dataset, view.sortBy)) {
    const direction = view.sortDirection === "asc" ? 1 : -1;
    rows = [...rows].sort((a, b) =>
      compareCells(a[view.sortBy], b[view.sortBy], direction),
    );
  }
  if (view.limit !== null && rows.length > view.limit) {
    rows =
      !view.sortBy && hasTimeAxis(dataset, view)
        ? rows.slice(-view.limit)
        : rows.slice(0, view.limit);
  }
  return rows;
};

/**
 * Collapses a column into the one number a KPI shows. "auto" picks the only row,
 * the latest point of a time series, or the average of anything else.
 */
export const reduceColumn = (
  rows: DatasetRow[],
  key: string,
  reducer: KpiReducer,
  timeAxis: boolean,
): number | null => {
  const values = rows.flatMap((row) => {
    const value = numericValue(row[key]);
    return value === null ? [] : [value];
  });
  if (values.length === 0) {
    return null;
  }
  const resolved =
    reducer === "auto"
      ? values.length === 1
        ? "first"
        : timeAxis
          ? "last"
          : "avg"
      : reducer;
  switch (resolved) {
    case "first":
      return values[0];
    case "last":
      return values[values.length - 1];
    case "sum":
      return values.reduce((total, value) => total + value, 0);
    case "avg":
      return values.reduce((total, value) => total + value, 0) / values.length;
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
  }
};
