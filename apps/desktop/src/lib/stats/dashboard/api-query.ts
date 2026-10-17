import { ValidationError } from "@deadlock-mods/common/client-errors";
import { z } from "zod";
import type {
  CellValue,
  Dataset,
  DatasetField,
  DatasetRow,
  FieldFormat,
} from "./dataset";

/**
 * Custom widgets that read any deadlock-api endpoint. The user writes a path, the
 * response is flattened into rows and every field becomes something a chart can
 * plot. Requests stay on deadlock-api: the path is appended to its origin and
 * may not carry a scheme, a host or a parent segment.
 */

const DAY_S = 24 * 60 * 60;

export const API_PLACEHOLDERS = [
  "account_id",
  "now",
  "since_7d",
  "since_30d",
  "since_90d",
] as const;

/**
 * Starting points for the API query editor. `pnpm check:dashboard-endpoints`
 * loads every one of them against the live API.
 */
export const API_EXAMPLES = [
  {
    id: "globalHeroes",
    path: "/v1/analytics/hero-stats?min_unix_timestamp={since_30d}",
    listPath: "",
  },
  {
    id: "myHeroes",
    path: "/v1/players/hero-stats?account_ids={account_id}",
    listPath: "",
  },
  {
    id: "dailyGames",
    path: "/v1/analytics/game-stats?bucket=start_time_day&min_unix_timestamp={since_30d}",
    listPath: "",
  },
  {
    id: "myGameStats",
    path: "/v1/analytics/game-stats?account_ids={account_id}",
    listPath: "",
  },
  {
    id: "myItems",
    path: "/v1/analytics/item-stats?account_id={account_id}&min_matches=3",
    listPath: "",
  },
  {
    id: "mySynergies",
    path: "/v1/analytics/hero-synergy-stats?account_id={account_id}&min_matches=2",
    listPath: "",
  },
  {
    id: "myMetrics",
    path: "/v1/analytics/player-stats/metrics?account_ids={account_id}",
    listPath: "",
  },
  {
    id: "myCurve",
    path: "/v1/analytics/player-performance-curve?account_ids={account_id}",
    listPath: "",
  },
  {
    id: "badgeDistribution",
    path: "/v1/analytics/badge-distribution",
    listPath: "",
  },
  {
    id: "leaderboardEurope",
    path: "/v1/leaderboard/Europe",
    listPath: "entries",
  },
] as const;

export class ApiQueryError extends ValidationError {
  constructor(readonly reason: "invalidPath" | "needsAccount" | "notAList") {
    super(`custom api query: ${reason}`);
  }
}

const PATH_PATTERN = /^\/v[12]\/[\w\-./{}]*(\?[\w\-.,=&{}%]*)?$/;

const dayAligned = (unix: number) => Math.floor(unix / DAY_S) * DAY_S;

/** Fills the placeholders and rejects anything that is not a plain API path. */
export const resolveApiPath = (
  template: string,
  accountId: number | null,
  nowUnix = Math.floor(Date.now() / 1000),
): string => {
  const trimmed = template.trim();
  if (!PATH_PATTERN.test(trimmed) || trimmed.includes("..")) {
    throw new ApiQueryError("invalidPath");
  }
  return trimmed.replace(/\{(\w+)\}/g, (_token, name: string) => {
    switch (name) {
      case "account_id":
        if (accountId === null) {
          throw new ApiQueryError("needsAccount");
        }
        return String(accountId);
      // Aligned, so every mount asks for - and caches - the same URL.
      case "now":
        return String(Math.floor(nowUnix / 60) * 60);
      case "since_7d":
        return String(dayAligned(nowUnix - 7 * DAY_S));
      case "since_30d":
        return String(dayAligned(nowUnix - 30 * DAY_S));
      case "since_90d":
        return String(dayAligned(nowUnix - 90 * DAY_S));
      default:
        throw new ApiQueryError("invalidPath");
    }
  });
};

export const usesAccount = (template: string): boolean =>
  template.includes("{account_id}");

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

const jsonSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonSchema),
    z.record(z.string(), jsonSchema),
  ]),
);

export const parseJson = (payload: unknown): JsonValue =>
  jsonSchema.parse(payload);

type JsonObject = { [key: string]: JsonValue };

const isObject = (value: JsonValue | undefined): value is JsonObject =>
  value !== null &&
  value !== undefined &&
  typeof value === "object" &&
  !Array.isArray(value);

const toCell = (value: JsonValue): CellValue | undefined => {
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  // Short id lists (a hero duo) still read as a label; anything else is noise.
  if (
    Array.isArray(value) &&
    value.length <= 6 &&
    value.every((entry) => typeof entry === "number")
  ) {
    return value.join(",");
  }
  return undefined;
};

/** One level of nesting is flattened to `parent.child`; deeper trees are skipped. */
const flattenRow = (entry: JsonObject): DatasetRow => {
  const row: DatasetRow = {};
  for (const [key, value] of Object.entries(entry)) {
    if (isObject(value)) {
      for (const [childKey, childValue] of Object.entries(value)) {
        const cell = toCell(childValue);
        if (cell !== undefined) {
          row[`${key}.${childKey}`] = cell;
        }
      }
      continue;
    }
    const cell = toCell(value);
    if (cell !== undefined) {
      row[key] = cell;
    }
  }
  return row;
};

const atPath = (value: JsonValue, path: string): JsonValue | undefined =>
  path
    .split(".")
    .filter(Boolean)
    .reduce<JsonValue | undefined>(
      (current, key) => (isObject(current) ? current[key] : undefined),
      value,
    );

/**
 * Turns a response into rows: a list is used as is, an object of objects (the
 * metrics endpoint) becomes one row per key, a flat object a single row. Without
 * an explicit path the first list found on the top level is used.
 */
export const responseRows = (
  payload: JsonValue,
  listPath: string,
): DatasetRow[] => {
  const target = listPath ? atPath(payload, listPath) : payload;
  if (target === undefined) {
    throw new ApiQueryError("notAList");
  }

  if (Array.isArray(target)) {
    return target.flatMap((entry) =>
      isObject(entry) ? [flattenRow(entry)] : [],
    );
  }

  if (isObject(target)) {
    const values = Object.values(target);
    const firstList = values.find(Array.isArray);
    if (!listPath && firstList && firstList.some(isObject)) {
      return firstList.flatMap((entry) =>
        isObject(entry) ? [flattenRow(entry)] : [],
      );
    }
    if (values.length > 0 && values.every(isObject)) {
      return Object.entries(target).flatMap(([key, value]) =>
        isObject(value) ? [{ key, ...flattenRow(value) }] : [],
      );
    }
    return [flattenRow(target)];
  }

  throw new ApiQueryError("notAList");
};

const HERO_KEYS = /(^|_)hero_ids?\d?$/;
const TIME_KEYS = /(start_time|unix_timestamp|last_played|last_updated)$/;
// Five-plus digit buckets are timestamps (start_time_day and friends); small ones
// are badges or hero ids and stay numbers.
const MIN_TIMESTAMP = 1_000_000_000;

/** Best-effort format for a field nobody declared, from its name and values. */
export const guessFormat = (key: string, values: CellValue[]): FieldFormat => {
  const present = values.filter((value) => value !== null);
  if (present.length === 0) {
    return "text";
  }
  const strings = present.filter((value) => typeof value === "string");
  if (strings.length > 0) {
    return HERO_KEYS.test(key) ? "heroList" : "text";
  }
  const numbers = present.filter((value) => typeof value === "number");
  if (HERO_KEYS.test(key)) {
    return "hero";
  }
  if (key.endsWith("item_id")) {
    return "item";
  }
  if (key === "badge" || key.endsWith("_badge") || key === "badge_level") {
    return "badge";
  }
  if (
    (TIME_KEYS.test(key) || key === "bucket") &&
    numbers.every((value) => value >= MIN_TIMESTAMP)
  ) {
    return "date";
  }
  if (key.endsWith("_s") || key.endsWith("_time_s")) {
    return "clock";
  }
  if (
    /(rate|winrate|accuracy|percentage)$/.test(key) &&
    numbers.every((value) => value >= 0 && value <= 1)
  ) {
    return "percent";
  }
  if (numbers.every(Number.isInteger)) {
    return "integer";
  }
  return "decimal";
};

const SAMPLE_ROWS = 200;

export const describeFields = (rows: DatasetRow[]): DatasetField[] => {
  const sample = rows.slice(0, SAMPLE_ROWS);
  const keys = new Set(sample.flatMap((row) => Object.keys(row)));
  return [...keys].map((key) => ({
    key,
    label: key,
    format: guessFormat(
      key,
      sample.map((row) => row[key] ?? null),
    ),
  }));
};

export const datasetFromResponse = (
  payload: JsonValue,
  listPath: string,
): Dataset => {
  const rows = responseRows(payload, listPath);
  return { fields: describeFields(rows), rows };
};
