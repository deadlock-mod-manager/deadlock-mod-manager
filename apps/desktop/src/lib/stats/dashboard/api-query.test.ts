import { describe, expect, it } from "bun:test";
import {
  ApiQueryError,
  datasetFromResponse,
  guessFormat,
  parseJson,
  resolveApiPath,
} from "./api-query";

const NOW = 1_700_000_000;

describe("resolveApiPath", () => {
  it("fills the placeholders", () => {
    expect(
      resolveApiPath(
        "/v1/players/{account_id}/rank?since={since_7d}&until={now}",
        42,
        NOW,
      ),
    ).toBe(
      `/v1/players/42/rank?since=${Math.floor((NOW - 7 * 86_400) / 86_400) * 86_400}&until=${Math.floor(NOW / 60) * 60}`,
    );
  });

  it.each([
    "https://evil.example/v1/x",
    "//evil.example/v1/x",
    "/v1/../admin",
    "/v3/players",
    "v1/players",
    "/v1/players?x=<script>",
  ])("rejects %s", (path) => {
    expect(() => resolveApiPath(path, 1, NOW)).toThrow(ApiQueryError);
  });

  it("rejects unknown placeholders", () => {
    expect(() => resolveApiPath("/v1/x?id={password}", 1, NOW)).toThrow(
      ApiQueryError,
    );
  });

  it("asks for an account when the path needs one", () => {
    const reason = (() => {
      try {
        resolveApiPath("/v1/players/{account_id}/rank", null, NOW);
      } catch (error) {
        return error instanceof ApiQueryError ? error.reason : null;
      }
      return null;
    })();
    expect(reason).toBe("needsAccount");
  });
});

describe("datasetFromResponse", () => {
  it("uses a top-level list as rows and flattens one level", () => {
    const dataset = datasetFromResponse(
      parseJson([
        { hero_id: 1, wins: 5, nested: { value: 2 }, ids: [1, 2] },
        { hero_id: 2, wins: 7, nested: { value: 3 }, ids: [3] },
      ]),
      "",
    );
    expect(dataset.rows[0]).toEqual({
      hero_id: 1,
      wins: 5,
      "nested.value": 2,
      ids: "1,2",
    });
    expect(
      dataset.fields.find((field) => field.key === "hero_id")?.format,
    ).toBe("hero");
  });

  it("turns an object of objects into one row per key", () => {
    const dataset = datasetFromResponse(
      parseJson({ kills: { avg: 5, std: 1 }, deaths: { avg: 3, std: 2 } }),
      "",
    );
    expect(dataset.rows).toEqual([
      { key: "kills", avg: 5, std: 1 },
      { key: "deaths", avg: 3, std: 2 },
    ]);
  });

  it("finds a wrapped list on its own or by path", () => {
    const payload = parseJson({
      entries: [{ rank: 1, account_name: "a" }],
      region: "Europe",
    });
    expect(datasetFromResponse(payload, "").rows).toHaveLength(1);
    expect(datasetFromResponse(payload, "entries").rows).toHaveLength(1);
    expect(() => datasetFromResponse(payload, "missing")).toThrow(
      ApiQueryError,
    );
  });

  it("keeps a flat object as a single row", () => {
    const dataset = datasetFromResponse(parseJson({ badge: 91, rank: 9 }), "");
    expect(dataset.rows).toEqual([{ badge: 91, rank: 9 }]);
  });

  it("reads an empty list as no rows rather than an error", () => {
    expect(datasetFromResponse(parseJson([]), "").rows).toEqual([]);
  });
});

describe("guessFormat", () => {
  it.each([
    ["start_time", [1_700_000_000], "date"],
    ["bucket", [1_700_000_000], "date"],
    ["bucket", [0], "integer"],
    ["item_id", [7409189], "item"],
    ["enemy_hero_id", [3], "hero"],
    ["hero_ids", ["1,2"], "heroList"],
    ["avg_accuracy", [0.6], "percent"],
    ["avg_buy_time_s", [988.2], "clock"],
    ["badge_level", [91], "badge"],
    ["avg_kills", [6.8], "decimal"],
    ["account_name", ["x"], "text"],
  ] as const)("%s %j -> %s", (key, values, format) => {
    expect(guessFormat(key, [...values])).toBe(format);
  });
});
