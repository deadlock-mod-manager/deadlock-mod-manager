import {
  type Dataset,
  type DatasetField,
  isCategoryField,
  isNumericField,
  numericValue,
} from "./dataset";
import {
  type ChartType,
  defaultView,
  MAX_SERIES,
  type MatchGroup,
  type WidgetView,
} from "./layout";

/**
 * Picks sensible fields and chart types so a new widget shows something useful
 * before the user touches a single option, and so switching the chart type never
 * leaves it pointing at fields that type cannot draw.
 */

const SERIES_LIMIT = {
  kpi: MAX_SERIES,
  line: MAX_SERIES,
  area: MAX_SERIES,
  bar: MAX_SERIES,
  barHorizontal: MAX_SERIES,
  stackedBar: MAX_SERIES,
  pie: 1,
  donut: 1,
  radar: 3,
  scatter: 3,
  radial: 1,
  table: MAX_SERIES,
} satisfies Record<ChartType, number>;

/** Charts that plot values against a category and cannot do without one. */
const NEEDS_CATEGORY: ReadonlySet<ChartType> = new Set([
  "line",
  "area",
  "bar",
  "barHorizontal",
  "stackedBar",
  "pie",
  "donut",
  "radar",
]);

export const seriesLimit = (chart: ChartType): number => SERIES_LIMIT[chart];

export const needsCategory = (chart: ChartType): boolean =>
  NEEDS_CATEGORY.has(chart);

const valueFields = (dataset: Dataset): DatasetField[] =>
  dataset.fields.filter(
    (field) => isNumericField(field) && !isCategoryField(field),
  );

const categoryFields = (dataset: Dataset): DatasetField[] =>
  dataset.fields.filter(isCategoryField);

// Ids and bucket keys are numbers, but plotting them says nothing.
const ID_LIKE = /(^|_)(ids?|bucket)\d?$/;
const PREFERRED = [
  "winrate",
  "matches",
  "matches_played",
  "total_matches",
  "wins",
  "value",
];

const isConstant = (dataset: Dataset, key: string) =>
  dataset.rows.length > 1 &&
  dataset.rows.every((row) => row[key] === dataset.rows[0]?.[key]);

/** The value fields worth suggesting, the familiar ones first. */
const plottableValues = (dataset: Dataset, exclude: string): DatasetField[] => {
  const candidates = valueFields(dataset).filter(
    (field) =>
      field.key !== exclude &&
      !ID_LIKE.test(field.key) &&
      !isConstant(dataset, field.key),
  );
  const rank = (field: DatasetField) => {
    const exact = PREFERRED.indexOf(field.key);
    if (exact >= 0) {
      return exact;
    }
    const suffix = PREFERRED.findIndex((key) => field.key.endsWith(`_${key}`));
    return PREFERRED.length + (suffix < 0 ? PREFERRED.length : suffix);
  };
  return [...candidates].sort((a, b) => rank(a) - rank(b));
};

/** A strictly rising integer column reads as an axis (match progress, a rank). */
const isAxisLike = (dataset: Dataset, field: DatasetField) =>
  dataset.rows.length > 2 &&
  dataset.rows.every((row, index) => {
    const value = numericValue(row[field.key]);
    const previous =
      index > 0 ? numericValue(dataset.rows[index - 1]?.[field.key]) : null;
    return (
      value !== null &&
      Number.isInteger(value) &&
      (previous === null || value > previous)
    );
  });

const suggestedCategory = (dataset: Dataset): DatasetField | undefined =>
  categoryFields(dataset)[0] ??
  valueFields(dataset).find((field) => isAxisLike(dataset, field));

/** Whether the data can feed a chart type at all, for greying out the picker. */
export const supportsChart = (dataset: Dataset, chart: ChartType): boolean => {
  const values = valueFields(dataset).length;
  if (values === 0) {
    return chart === "table";
  }
  if (chart === "scatter") {
    return values >= 2;
  }
  if (needsCategory(chart)) {
    // Any field can serve as the axis, but it needs something to plot against.
    return dataset.fields.length > 1 && dataset.rows.length > 1;
  }
  return true;
};

const chartFor = (dataset: Dataset, category: DatasetField | undefined) => {
  if (!category) {
    return dataset.rows.length === 1 ? "kpi" : "table";
  }
  switch (category.format) {
    case "date":
      return "line";
    case "hour":
    case "weekday":
    case "session":
    case "durationBucket":
    case "badge":
      return "bar";
    case "result":
      return "donut";
    default:
      return dataset.rows.length > 12 ? "barHorizontal" : "bar";
  }
};

export const suggestView = (dataset: Dataset): WidgetView => {
  const category = suggestedCategory(dataset);
  const values = plottableValues(dataset, category?.key ?? "");
  const chart =
    category && !isCategoryField(category)
      ? "line"
      : chartFor(dataset, category);
  const y = (values.length > 0 ? values : valueFields(dataset)).slice(0, 1);
  return defaultView(chart, {
    x: category?.key ?? "",
    y: y.map((field) => field.key),
    limit: chart === "barHorizontal" ? 15 : null,
    sortBy: chart === "barHorizontal" ? (y[0]?.key ?? "") : "",
  });
};

/** Re-fits a view to a chart type: fills a missing category, trims extra series. */
export const adaptView = (
  view: WidgetView,
  dataset: Dataset,
  chart: ChartType,
): WidgetView => {
  const values = valueFields(dataset);
  const keys = new Set(dataset.fields.map((field) => field.key));
  let y = view.y.filter((key) => keys.has(key));
  const fallback = plottableValues(dataset, view.x)[0] ?? values[0];
  if (y.length === 0 && fallback) {
    y = [fallback.key];
  }
  if (chart === "scatter") {
    for (const field of values) {
      if (y.length >= 2) break;
      if (!y.includes(field.key)) y = [...y, field.key];
    }
  }
  const x =
    keys.has(view.x) || !needsCategory(chart)
      ? view.x
      : (suggestedCategory(dataset)?.key ??
        dataset.fields.find((field) => !y.includes(field.key))?.key ??
        "");
  return {
    ...view,
    chart,
    x: keys.has(x) ? x : "",
    y: y.slice(0, seriesLimit(chart)),
    sortBy: keys.has(view.sortBy) ? view.sortBy : "",
  };
};

/** The chart a match query reads best as, by what it groups on. */
export const chartForGroup = (group: MatchGroup): ChartType => {
  switch (group) {
    case "none":
      return "kpi";
    case "match":
    case "day":
    case "week":
    case "month":
      return "line";
    case "hero":
      return "barHorizontal";
    case "result":
      return "donut";
    default:
      return "bar";
  }
};
