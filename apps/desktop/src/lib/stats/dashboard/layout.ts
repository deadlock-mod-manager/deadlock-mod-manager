import { z } from "zod";

/**
 * The Stats dashboard as data: tabs holding widgets on a 12-column grid. The
 * built-in tabs are just the default value of this layout, so editing them and
 * building new ones go through the same code.
 *
 * Widget sources reference panels and presets by id rather than by schema enum:
 * an id a later release drops must render as a broken widget, not throw away the
 * user's whole layout on load.
 */

export const GRID_COLUMNS = 12;
/** One height step in the editor. Small enough to fit a stat tile snugly. */
export const ROW_HEIGHT_PX = 40;
export const MIN_ROWS = 2;
export const MAX_ROWS = 30;
export const MAX_SERIES = 4;

export const CHART_TYPES = [
  "kpi",
  "line",
  "area",
  "bar",
  "barHorizontal",
  "stackedBar",
  "pie",
  "donut",
  "radar",
  "scatter",
  "radial",
  "table",
] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export const KPI_REDUCERS = [
  "auto",
  "first",
  "last",
  "avg",
  "sum",
  "min",
  "max",
] as const;
export type KpiReducer = (typeof KPI_REDUCERS)[number];

export const TAB_ICONS = [
  "chart",
  "sword",
  "package",
  "users",
  "radio",
  "trophy",
  "target",
  "flame",
  "clock",
  "star",
  "globe",
  "coins",
] as const;
export type TabIcon = (typeof TAB_ICONS)[number];

export const MATCH_METRICS = [
  "matches",
  "wins",
  "losses",
  "winrate",
  "kills",
  "deaths",
  "assists",
  "kda",
  "netWorth",
  "soulsPerMin",
  "lastHits",
  "lastHitsPerMin",
  "denies",
  "durationMin",
  "heroLevel",
  "rankBadge",
  "rankDelta",
] as const;
export type MatchMetric = (typeof MATCH_METRICS)[number];

export const MATCH_GROUPS = [
  "none",
  "match",
  "day",
  "week",
  "month",
  "hero",
  "weekday",
  "hour",
  "result",
  "session",
  "duration",
] as const;
export type MatchGroup = (typeof MATCH_GROUPS)[number];

export const MATCH_AGGREGATES = ["avg", "sum", "min", "max", "median"] as const;
export type MatchAggregate = (typeof MATCH_AGGREGATES)[number];

export const matchQuerySchema = z.object({
  metrics: z.array(z.enum(MATCH_METRICS)).min(1).max(MAX_SERIES),
  aggregate: z.enum(MATCH_AGGREGATES).default("avg"),
  groupBy: z.enum(MATCH_GROUPS).default("none"),
  /** Only the newest N matches; `null` is the whole history. */
  lastMatches: z.number().int().positive().nullable().default(null),
  sinceDays: z.number().int().positive().nullable().default(null),
  heroId: z.number().int().nullable().default(null),
  result: z.enum(["all", "wins", "losses"]).default("all"),
  rankedOnly: z.boolean().default(false),
  /** Rolling average over N matches, only meaningful when grouped per match. */
  smoothing: z.number().int().min(2).max(50).nullable().default(null),
});
export type MatchQuery = z.infer<typeof matchQuerySchema>;

const presetParamValue = z.union([z.string(), z.number()]);

export const widgetSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("panel"), panel: z.string() }),
  z.object({
    kind: z.literal("preset"),
    preset: z.string(),
    params: z.record(z.string(), presetParamValue).default({}),
  }),
  z.object({ kind: z.literal("matches"), query: matchQuerySchema }),
  z.object({
    kind: z.literal("api"),
    path: z.string(),
    /** Dot path to the list inside the response, for endpoints that wrap it. */
    listPath: z.string().default(""),
  }),
]);
export type WidgetSource = z.infer<typeof widgetSourceSchema>;

export const widgetViewSchema = z.object({
  chart: z.enum(CHART_TYPES),
  /** Category / x-axis field. Scatter uses it as the point label. */
  x: z.string().default(""),
  /** Value fields, one series each. */
  y: z.array(z.string()).max(MAX_SERIES).default([]),
  /** Field the rows are sorted by before `limit` applies; empty keeps API order. */
  sortBy: z.string().default(""),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
  limit: z.number().int().positive().max(500).nullable().default(null),
  color: z.number().int().min(0).default(0),
  showLabels: z.boolean().default(false),
  showGrid: z.boolean().default(true),
  showLegend: z.boolean().default(true),
  smooth: z.boolean().default(true),
  reduce: z.enum(KPI_REDUCERS).default("auto"),
});
export type WidgetView = z.infer<typeof widgetViewSchema>;

export const widgetSchema = z.object({
  id: z.string(),
  /** Empty means "use the source's own name". */
  title: z.string().default(""),
  w: z.number().int().min(1).max(GRID_COLUMNS),
  /** Height in grid rows; `null` lets the content decide. */
  h: z.number().int().min(MIN_ROWS).max(MAX_ROWS).nullable(),
  source: widgetSourceSchema,
  view: widgetViewSchema.optional(),
});
export type DashboardWidget = z.infer<typeof widgetSchema>;

export const tabSchema = z.object({
  id: z.string(),
  /** `null` shows the translated default name for the built-in tab ids. */
  title: z.string().nullable(),
  icon: z.enum(TAB_ICONS).catch("chart"),
  widgets: z.array(widgetSchema),
});
export type DashboardTab = z.infer<typeof tabSchema>;

export const layoutSchema = z.object({
  version: z.literal(1),
  tabs: z.array(tabSchema).min(1),
});
export type DashboardLayout = z.infer<typeof layoutSchema>;

export const createId = (prefix: string): string =>
  `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

export const defaultView = (
  chart: ChartType,
  overrides: Partial<WidgetView> = {},
): WidgetView => ({ ...widgetViewSchema.parse({ chart }), ...overrides });

const panel = (id: string, panelId: string, w = GRID_COLUMNS) =>
  ({
    id,
    title: "",
    w,
    h: null,
    source: { kind: "panel", panel: panelId },
  }) satisfies DashboardWidget;

/** The dashboard as it shipped before it became editable. */
export const DEFAULT_LAYOUT: DashboardLayout = {
  version: 1,
  tabs: [
    {
      id: "overview",
      title: null,
      icon: "chart",
      widgets: [
        panel("overview-tiles", "tiles"),
        panel("overview-insights", "insights"),
        panel("overview-form", "form"),
        panel("overview-session", "session", 6),
        panel("overview-rank", "rank", 6),
        panel("overview-recent", "recentMatches"),
      ],
    },
    {
      id: "heroes",
      title: null,
      icon: "sword",
      widgets: [panel("heroes-explorer", "heroes")],
    },
    {
      id: "items",
      title: null,
      icon: "package",
      widgets: [panel("items-explorer", "items")],
    },
    {
      id: "squad",
      title: null,
      icon: "users",
      widgets: [panel("squad-explorer", "squad")],
    },
    {
      id: "live",
      title: null,
      icon: "radio",
      widgets: [panel("live-scoreboard", "live")],
    },
  ],
};

export const DEFAULT_TAB_IDS = new Set(
  DEFAULT_LAYOUT.tabs.map((tab) => tab.id),
);

export const cloneLayout = (layout: DashboardLayout): DashboardLayout =>
  structuredClone(layout);

/**
 * Reads a persisted layout. Anything that no longer parses falls back to the
 * default instead of leaving the Stats page blank.
 */
export const parseLayout = (stored: DashboardLayout | null) => {
  if (stored === null) {
    return { layout: DEFAULT_LAYOUT, recovered: false };
  }
  const parsed = layoutSchema.safeParse(stored);
  return parsed.success
    ? { layout: parsed.data, recovered: false }
    : { layout: DEFAULT_LAYOUT, recovered: true };
};

const mapTab = (
  layout: DashboardLayout,
  tabId: string,
  update: (tab: DashboardTab) => DashboardTab,
): DashboardLayout => ({
  ...layout,
  tabs: layout.tabs.map((tab) => (tab.id === tabId ? update(tab) : tab)),
});

export const addTab = (
  layout: DashboardLayout,
  tab: DashboardTab,
): DashboardLayout => ({ ...layout, tabs: [...layout.tabs, tab] });

export const removeTab = (
  layout: DashboardLayout,
  tabId: string,
): DashboardLayout =>
  layout.tabs.length <= 1
    ? layout
    : { ...layout, tabs: layout.tabs.filter((tab) => tab.id !== tabId) };

export const updateTab = (
  layout: DashboardLayout,
  tabId: string,
  patch: Partial<Pick<DashboardTab, "title" | "icon">>,
): DashboardLayout => mapTab(layout, tabId, (tab) => ({ ...tab, ...patch }));

export const moveTab = (
  layout: DashboardLayout,
  tabId: string,
  offset: -1 | 1,
): DashboardLayout => {
  const index = layout.tabs.findIndex((tab) => tab.id === tabId);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= layout.tabs.length) {
    return layout;
  }
  const tabs = [...layout.tabs];
  [tabs[index], tabs[target]] = [tabs[target], tabs[index]];
  return { ...layout, tabs };
};

export const upsertWidget = (
  layout: DashboardLayout,
  tabId: string,
  widget: DashboardWidget,
): DashboardLayout =>
  mapTab(layout, tabId, (tab) => ({
    ...tab,
    widgets: tab.widgets.some((entry) => entry.id === widget.id)
      ? tab.widgets.map((entry) => (entry.id === widget.id ? widget : entry))
      : [...tab.widgets, widget],
  }));

export const removeWidget = (
  layout: DashboardLayout,
  tabId: string,
  widgetId: string,
): DashboardLayout =>
  mapTab(layout, tabId, (tab) => ({
    ...tab,
    widgets: tab.widgets.filter((widget) => widget.id !== widgetId),
  }));

export const resizeWidget = (
  layout: DashboardLayout,
  tabId: string,
  widgetId: string,
  size: Pick<DashboardWidget, "w" | "h">,
): DashboardLayout =>
  mapTab(layout, tabId, (tab) => ({
    ...tab,
    widgets: tab.widgets.map((widget) =>
      widget.id === widgetId ? { ...widget, ...size } : widget,
    ),
  }));

/** Moves a widget to the slot of another one, shifting everything between. */
export const reorderWidget = (
  layout: DashboardLayout,
  tabId: string,
  widgetId: string,
  targetId: string,
): DashboardLayout =>
  mapTab(layout, tabId, (tab) => {
    const from = tab.widgets.findIndex((widget) => widget.id === widgetId);
    const to = tab.widgets.findIndex((widget) => widget.id === targetId);
    if (from < 0 || to < 0 || from === to) {
      return tab;
    }
    const widgets = [...tab.widgets];
    const [moved] = widgets.splice(from, 1);
    widgets.splice(to, 0, moved);
    return { ...tab, widgets };
  });

export const moveWidgetToTab = (
  layout: DashboardLayout,
  fromTabId: string,
  widgetId: string,
  toTabId: string,
): DashboardLayout => {
  const widget = layout.tabs
    .find((tab) => tab.id === fromTabId)
    ?.widgets.find((entry) => entry.id === widgetId);
  if (!widget || fromTabId === toTabId) {
    return layout;
  }
  return upsertWidget(
    removeWidget(layout, fromTabId, widgetId),
    toTabId,
    widget,
  );
};

export const duplicateWidget = (
  layout: DashboardLayout,
  tabId: string,
  widgetId: string,
): DashboardLayout =>
  mapTab(layout, tabId, (tab) => {
    const index = tab.widgets.findIndex((widget) => widget.id === widgetId);
    if (index < 0) {
      return tab;
    }
    const widgets = [...tab.widgets];
    widgets.splice(index + 1, 0, {
      ...structuredClone(tab.widgets[index]),
      id: createId("widget"),
    });
    return { ...tab, widgets };
  });
