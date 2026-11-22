import {
  ProviderError,
  RuntimeError,
} from "@deadlock-mods/common/client-errors";
import type { z } from "zod";
import { type MatchHistoryEntry, requestJson } from "@/lib/stats/api";
import type { CellValue, Dataset, DatasetField, FieldFormat } from "../dataset";
import type { WidgetView } from "../layout";

/**
 * Everything a preset module needs: the preset contract, the three ways a
 * preset gets its data (match history, an account-bound or a global request)
 * and the parsing that turns a changed API into a visible error.
 */

export class DashboardSchemaError extends ProviderError {
  constructor(readonly endpoint: string) {
    super(`deadlock-api ${endpoint} no longer matches the dashboard schema`);
  }
}

export const PRESET_CATEGORIES = [
  "you",
  "heroes",
  "items",
  "squad",
  "ranked",
  "global",
] as const;
type PresetCategory = (typeof PRESET_CATEGORIES)[number];

type ParamValue = string | number;
export type PresetParams = Record<string, ParamValue>;

interface PresetParamOption {
  value: ParamValue;
  /** i18n key under `stats.dashboard.options`, interpolated with `count`. */
  label: string;
  count?: number;
}

export interface PresetParam {
  key: string;
  kind: "select" | "hero";
  default: ParamValue;
  options?: PresetParamOption[];
}

interface PresetContext {
  accountId: number | null;
  matches: MatchHistoryEntry[];
}

export type PresetQuery =
  | { kind: "local"; build: () => Dataset }
  | {
      kind: "remote";
      cacheKey: string;
      /** Account-bound keys are dropped by the manual refresh. */
      playerScoped: boolean;
      ttl: number;
      endpoint: string;
      load: () => Promise<Dataset>;
    };

export interface PresetDef {
  id: string;
  category: PresetCategory;
  /** Shown on broken widgets so the user can tell which request failed. */
  endpoint: string;
  needsAccount: boolean;
  /** Joins with or derives from the match history the page loads. */
  needsHistory: boolean;
  params: PresetParam[];
  view: WidgetView;
  size: { w: number; h: number };
  query: (ctx: PresetContext, params: PresetParams) => PresetQuery;
}

const DAY_S = 24 * 60 * 60;
export const HISTORY_ENDPOINT = "/v1/players/{account_id}/match-history";

const nowUnix = () => Math.floor(Date.now() / 1000);
export const daysAgo = (days: number) => nowUnix() - days * DAY_S;
/** Day-aligned, so the URL - and with it the API's own cache - is stable all day. */
export const sinceDays = (days: number) =>
  Math.floor(daysAgo(days) / DAY_S) * DAY_S;

export const ratio = (part: number, whole: number) =>
  whole > 0 ? part / whole : 0;

export const numberParam = (
  params: PresetParams,
  key: string,
  fallback: number,
) => {
  const value = Number(params[key]);
  return Number.isFinite(value) ? value : fallback;
};

export const textParam = (
  params: PresetParams,
  key: string,
  fallback: string,
) => {
  const value = params[key];
  return value === undefined ? fallback : String(value);
};

/** `window` is "the newest N matches"; 0 stands for all of them. */
export const lastMatchesOf = (params: PresetParams) => {
  const window = numberParam(params, "window", 0);
  return window > 0 ? window : null;
};

const WINDOW_OPTIONS: PresetParamOption[] = [
  { value: 0, label: "allMatches" },
  ...[10, 20, 30, 50, 100].map((count) => ({
    value: count,
    label: "lastMatches",
    count,
  })),
];

export const windowParam = (fallback: number): PresetParam => ({
  key: "window",
  kind: "select",
  default: fallback,
  options: WINDOW_OPTIONS,
});

export const daysParam = (
  fallback: number,
  days = [7, 30, 90],
): PresetParam => ({
  key: "days",
  kind: "select",
  default: fallback,
  options: days.map((count) => ({ value: count, label: "lastDays", count })),
});

/**
 * One column of a dataset: its key, how it renders and how each source item
 * produces it. Declaring all three together keeps field list and rows in step.
 */
export type Column<T> = readonly [
  key: string,
  format: FieldFormat,
  value: (item: T) => CellValue,
  extra?: Partial<DatasetField>,
];

export const tabulate = <T>(
  items: readonly T[],
  columns: readonly Column<T>[],
): Dataset => ({
  fields: columns.map(([key, format, , extra]) => ({ key, format, ...extra })),
  rows: items.map((item) =>
    Object.fromEntries(columns.map(([key, , value]) => [key, value(item)])),
  ),
});

/** Copies a response field as is; numbers the API leaves out read as empty. */
export const pick =
  (source: string) =>
  (row: Record<string, number | null>): CellValue =>
    row[source] ?? null;

/** Parses a list response; a non-empty list where no row parses has changed shape. */
const fetchList = async <T>(
  path: string,
  endpoint: string,
  schema: z.ZodType<T>,
): Promise<T[]> => {
  const payload = await requestJson(path);
  if (!Array.isArray(payload)) {
    throw new DashboardSchemaError(endpoint);
  }
  const rows = payload.flatMap((entry) => {
    const parsed = schema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
  if (payload.length > 0 && rows.length === 0) {
    throw new DashboardSchemaError(endpoint);
  }
  return rows;
};

const fetchOne = async <T>(
  path: string,
  endpoint: string,
  schema: z.ZodType<T>,
): Promise<T> => {
  const parsed = schema.safeParse(await requestJson(path));
  if (!parsed.success) {
    throw new DashboardSchemaError(endpoint);
  }
  return parsed.data;
};

/** Requests bound to the preset's endpoint, so errors always name it. */
export interface Api {
  list: <T>(path: string, schema: z.ZodType<T>) => Promise<T[]>;
  one: <T>(path: string, schema: z.ZodType<T>) => Promise<T>;
}

const apiFor = (endpoint: string): Api => ({
  list: (path, schema) => fetchList(path, endpoint, schema),
  one: (path, schema) => fetchOne(path, endpoint, schema),
});

interface PresetMeta {
  id: string;
  category: PresetCategory;
  params?: PresetParam[];
  view: WidgetView;
  size: { w: number; h: number };
}

const paramsKey = (params: PresetParams) =>
  Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

/** Derived from the match history the page already holds; costs no request. */
export const historyPreset = ({
  build,
  ...meta
}: PresetMeta & {
  build: (matches: MatchHistoryEntry[], params: PresetParams) => Dataset;
}): PresetDef => ({
  ...meta,
  params: meta.params ?? [],
  endpoint: HISTORY_ENDPOINT,
  needsAccount: true,
  needsHistory: true,
  query: (ctx, params) => ({
    kind: "local",
    build: () => build(ctx.matches, params),
  }),
});

/**
 * A request about the selected account. Presets that join the response with
 * the history key the cache on it too, so a new match redoes the join instead
 * of serving yesterday's.
 */
export const playerPreset = ({
  endpoint,
  ttl,
  needsHistory = false,
  load,
  ...meta
}: PresetMeta & {
  endpoint: string;
  ttl: number;
  needsHistory?: boolean;
  load: (input: {
    accountId: number;
    matches: MatchHistoryEntry[];
    params: PresetParams;
    api: Api;
  }) => Promise<Dataset>;
}): PresetDef => ({
  ...meta,
  params: meta.params ?? [],
  endpoint,
  needsAccount: true,
  needsHistory,
  query: (ctx, params) => {
    // Widgets gate account-bound presets before querying; this is a bug guard.
    const { accountId } = ctx;
    if (accountId === null) {
      throw new RuntimeError("account-bound dashboard preset ran without one");
    }
    const history = needsHistory
      ? `:${ctx.matches.length}:${ctx.matches.reduce((latest, match) => Math.max(latest, match.match_id), 0)}`
      : "";
    return {
      kind: "remote",
      cacheKey: `player:dashboard:${meta.id}:${paramsKey(params)}:${accountId}${history}`,
      playerScoped: true,
      ttl,
      endpoint,
      load: () =>
        load({
          accountId,
          matches: ctx.matches,
          params,
          api: apiFor(endpoint),
        }),
    };
  },
});

/** Everyone's matches; no account needed, cached across accounts. */
export const globalPreset = ({
  endpoint,
  ttl,
  load,
  ...meta
}: PresetMeta & {
  endpoint: string;
  ttl: number;
  load: (input: { params: PresetParams; api: Api }) => Promise<Dataset>;
}): PresetDef => ({
  ...meta,
  params: meta.params ?? [],
  endpoint,
  needsAccount: false,
  needsHistory: false,
  query: (_ctx, params) => ({
    kind: "remote",
    cacheKey: `dashboard:${meta.id}:${paramsKey(params)}`,
    playerScoped: false,
    ttl,
    endpoint,
    load: () => load({ params, api: apiFor(endpoint) }),
  }),
});
