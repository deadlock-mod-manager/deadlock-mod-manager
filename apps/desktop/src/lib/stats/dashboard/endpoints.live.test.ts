import { describe, expect, it, mock } from "bun:test";
import path from "node:path";
import { z } from "zod";
import { jsonValueSchema } from "@/lib/validation/json";

/**
 * Loads every dashboard preset and API example against the real deadlock-api
 * and checks each endpoint against its published OpenAPI document. Off by
 * default so ordinary test runs never touch the network:
 *
 *   pnpm --filter @deadlock-mods/desktop check:dashboard-endpoints
 *
 * The stats-dashboard-endpoints skill walks through fixing what this reports.
 */

const LIVE = process.env.DASHBOARD_LIVE === "1";
const BASE_URL =
  process.env.DASHBOARD_API_URL ?? "https://api.deadlock-api.com";
const TIMEOUT_MS = 240_000;

const getJson = async (requestPath: string) => {
  const response = await fetch(`${BASE_URL}${requestPath}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${requestPath}`);
  }
  return jsonValueSchema.parse(await response.json());
};

const openApiSchema = z.object({
  paths: z.record(
    z.string(),
    z.object({
      get: z
        .object({
          deprecated: z.boolean().optional(),
          description: z.string().optional(),
          parameters: z
            .array(z.object({ name: z.string() }))
            .optional()
            .default([]),
        })
        .optional(),
    }),
  ),
});

type OpenApi = z.infer<typeof openApiSchema>;

/** Template path ("/v1/players/{account_id}/rank") for a concrete one. */
const operationFor = (openApi: OpenApi, requestPath: string) => {
  const [pathname] = requestPath.split("?");
  return Object.entries(openApi.paths).find(([template]) =>
    new RegExp(`^${template.replace(/\{[^}]+\}/g, "[^/]+")}$`).test(
      pathname ?? "",
    ),
  );
};

/** Problems the OpenAPI document reports for one concrete request. */
const contractProblems = (openApi: OpenApi, requestPath: string): string[] => {
  const operation = operationFor(openApi, requestPath);
  const get = operation?.[1].get;
  if (!operation || !get) {
    return [`${requestPath.split("?")[0]} is not in the OpenAPI document`];
  }
  const problems: string[] = [];
  if (get.deprecated || /^\s*\**deprecated/i.test(get.description ?? "")) {
    problems.push(`${operation[0]} is deprecated`);
  }
  const known = new Set(get.parameters.map((parameter) => parameter.name));
  const query = new URLSearchParams(requestPath.split("?")[1] ?? "");
  for (const name of new Set(query.keys())) {
    if (!known.has(name)) {
      problems.push(`${operation[0]} no longer accepts ?${name}`);
    }
  }
  return problems;
};

/** An active account with plenty of history, so player presets have data. */
const sampleAccount = async (): Promise<number> => {
  const fromEnv = Number(process.env.DASHBOARD_ACCOUNT_ID);
  if (Number.isSafeInteger(fromEnv) && fromEnv > 0) {
    return fromEnv;
  }
  const [top] = z
    .array(z.object({ account_id: z.number() }))
    .parse(
      await getJson(
        "/v1/analytics/scoreboards/players?sort_by=matches&limit=1",
      ),
    );
  if (!top) {
    throw new Error("The player scoreboard returned no account to test with");
  }
  return top.account_id;
};

describe.skipIf(!LIVE)("dashboard endpoints (live)", () => {
  it(
    "every preset loads, parses and has the fields its default view plots",
    async () => {
      const requested: string[] = [];
      // The app's client goes through Tauri's HTTP plugin; outside the app the
      // same calls run on plain fetch, and every path is recorded for the
      // OpenAPI check.
      mock.module(path.resolve(import.meta.dir, "../api.ts"), () => ({
        requestJson: (requestPath: string) => {
          requested.push(requestPath);
          return getJson(requestPath);
        },
        getItemStats: ({ minMatches = 3 }: { minMatches?: number } = {}) => {
          const requestPath = `/v1/analytics/item-stats?min_matches=${minMatches}`;
          requested.push(requestPath);
          return getJson(requestPath);
        },
        getSteamProfiles: (accountIds: number[]) => {
          if (accountIds.length === 0) {
            return Promise.resolve([]);
          }
          const requestPath = `/v1/players/steam?account_ids=${accountIds.join(",")}`;
          requested.push(requestPath);
          return getJson(requestPath);
        },
      }));
      const { PRESETS, defaultParams } = await import("./catalog");
      const { missingFields, numericValue } = await import("./dataset");
      const { matchHistoryEntrySchema } =
        await import("@/lib/validation/stats-api");

      const openApi = openApiSchema.parse(await getJson("/openapi.json"));
      const accountId = await sampleAccount();
      const historyPath = `/v1/players/${accountId}/match-history`;
      const matches = z
        .array(matchHistoryEntrySchema)
        .parse(await getJson(historyPath));
      requested.push(historyPath);

      const failures: string[] = [];
      for (const preset of PRESETS) {
        try {
          const query = preset.query(
            { accountId, matches },
            defaultParams(preset),
          );
          const dataset =
            query.kind === "local" ? query.build() : await query.load();
          const { view } = preset;
          const missing = missingFields(dataset, [
            view.x,
            ...view.y,
            view.sortBy,
          ]);
          const plottable = dataset.rows.filter((row) =>
            view.y.every((key) => numericValue(row[key]) !== null),
          ).length;
          if (dataset.rows.length === 0) {
            failures.push(`${preset.id}: no rows`);
          } else if (missing.length > 0) {
            failures.push(`${preset.id}: missing ${missing.join(", ")}`);
          } else if (plottable === 0) {
            failures.push(`${preset.id}: no row has a value for ${view.y}`);
          }
        } catch (error) {
          failures.push(`${preset.id}: ${String(error)}`);
        }
      }

      for (const requestPath of new Set(requested)) {
        for (const problem of contractProblems(openApi, requestPath)) {
          failures.push(`contract: ${problem}`);
        }
      }

      expect(failures).toEqual([]);
    },
    TIMEOUT_MS,
  );

  it(
    "every API example resolves, loads and suggests a chart",
    async () => {
      const { API_EXAMPLES, datasetFromResponse, resolveApiPath } =
        await import("./api-query");
      const { suggestView } = await import("./suggest");

      const openApi = openApiSchema.parse(await getJson("/openapi.json"));
      const accountId = await sampleAccount();
      const failures: string[] = [];

      for (const example of API_EXAMPLES) {
        try {
          const requestPath = resolveApiPath(example.path, accountId);
          failures.push(
            ...contractProblems(openApi, requestPath).map(
              (problem) => `${example.id}: ${problem}`,
            ),
          );
          const dataset = datasetFromResponse(
            await getJson(requestPath),
            example.listPath,
          );
          if (dataset.rows.length === 0) {
            failures.push(`${example.id}: no rows`);
          } else if (suggestView(dataset).y.length === 0) {
            failures.push(`${example.id}: nothing numeric to chart`);
          }
        } catch (error) {
          failures.push(`${example.id}: ${String(error)}`);
        }
      }

      expect(failures).toEqual([]);
    },
    TIMEOUT_MS,
  );
});
