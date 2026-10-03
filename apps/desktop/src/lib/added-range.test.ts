import { describe, expect, it } from "bun:test";
import { getAddedRange, isAddedFilterActive } from "./utils";

const DAY_SECONDS = 24 * 60 * 60;
const localMidnight = (date: string) =>
  new Date(`${date}T00:00:00`).getTime() / 1_000;

describe("getAddedRange", () => {
  it("leaves both sides open for any time", () => {
    expect(getAddedRange({ period: "any", from: "", to: "" })).toEqual({
      after: null,
      before: null,
    });
  });

  it("starts today at local midnight", () => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    expect(getAddedRange({ period: "today", from: "", to: "" })).toEqual({
      after: startOfDay.getTime() / 1_000,
      before: null,
    });
  });

  it("includes the whole custom end day", () => {
    expect(
      getAddedRange({ period: "custom", from: "2026-09-01", to: "2026-09-10" }),
    ).toEqual({
      after: localMidnight("2026-09-01"),
      before: localMidnight("2026-09-10") + DAY_SECONDS,
    });
  });

  it("leaves a custom side open when its date is empty", () => {
    expect(
      getAddedRange({ period: "custom", from: "2026-09-01", to: "" }),
    ).toEqual({ after: localMidnight("2026-09-01"), before: null });
  });
});

describe("isAddedFilterActive", () => {
  it("ignores a custom range with no dates", () => {
    expect(isAddedFilterActive({ period: "custom", from: "", to: "" })).toBe(
      false,
    );
    expect(isAddedFilterActive({ period: "week", from: "", to: "" })).toBe(
      true,
    );
  });
});
