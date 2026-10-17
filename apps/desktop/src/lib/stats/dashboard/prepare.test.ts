import { describe, expect, it } from "bun:test";
import type { Dataset } from "./dataset";
import { defaultView } from "./layout";
import { prepareRows, reduceColumn } from "./prepare";
import { adaptView, suggestView, supportsChart } from "./suggest";

const heroes: Dataset = {
  fields: [
    { key: "heroId", format: "hero" },
    { key: "matches", format: "integer" },
    { key: "winrate", format: "percent" },
  ],
  rows: [
    { heroId: 1, matches: 10, winrate: 0.4 },
    { heroId: 2, matches: 30, winrate: 0.6 },
    { heroId: 3, matches: 20, winrate: null },
  ],
};

const timeline: Dataset = {
  fields: [
    { key: "day", format: "date" },
    { key: "matches", format: "integer" },
  ],
  rows: [
    { day: 1, matches: 1 },
    { day: 2, matches: 2 },
    { day: 3, matches: 3 },
  ],
};

describe("prepareRows", () => {
  it("sorts by the chosen field before cutting", () => {
    const rows = prepareRows(
      heroes,
      defaultView("bar", { x: "heroId", sortBy: "matches", limit: 2 }),
    );
    expect(rows.map((row) => row.heroId)).toEqual([2, 3]);
  });

  it("sinks missing values whichever way it sorts", () => {
    const asc = prepareRows(
      heroes,
      defaultView("bar", { sortBy: "winrate", sortDirection: "asc" }),
    );
    expect(asc.map((row) => row.heroId)).toEqual([1, 2, 3]);
  });

  it("keeps the newest rows of an unsorted time series", () => {
    const rows = prepareRows(
      timeline,
      defaultView("line", { x: "day", limit: 2 }),
    );
    expect(rows.map((row) => row.day)).toEqual([2, 3]);
  });
});

describe("reduceColumn", () => {
  it("picks the latest point of a time series and the mean otherwise", () => {
    expect(reduceColumn(timeline.rows, "matches", "auto", true)).toBe(3);
    expect(reduceColumn(timeline.rows, "matches", "auto", false)).toBe(2);
    expect(reduceColumn(heroes.rows, "winrate", "max", false)).toBe(0.6);
    expect(reduceColumn([], "winrate", "auto", false)).toBeNull();
  });
});

describe("chart suggestions", () => {
  it("suggests a line for dates and bars for many categories", () => {
    expect(suggestView(timeline)).toMatchObject({
      chart: "line",
      x: "day",
      y: ["matches"],
    });
    expect(suggestView(heroes).chart).toBe("bar");
  });

  it("suggests a single number for a single row", () => {
    expect(
      suggestView({
        fields: [{ key: "kda", format: "decimal" }],
        rows: [{ kda: 2 }],
      }).chart,
    ).toBe("kpi");
  });

  it("trims series to what the chart can draw", () => {
    const view = defaultView("bar", { x: "heroId", y: ["matches", "winrate"] });
    expect(adaptView(view, heroes, "pie").y).toEqual(["matches"]);
    expect(
      adaptView(defaultView("kpi", { y: ["matches"] }), heroes, "scatter").y,
    ).toEqual(["matches", "winrate"]);
  });

  it("refuses charts the data cannot feed", () => {
    expect(
      supportsChart(
        { fields: [{ key: "kda", format: "decimal" }], rows: [{ kda: 2 }] },
        "pie",
      ),
    ).toBe(false);
    expect(supportsChart(heroes, "scatter")).toBe(true);
  });
});
