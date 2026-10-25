import { describe, expect, it } from "bun:test";
import { getDateRange, isDateFilterActive } from "./utils";

const DAY_SECONDS = 24 * 60 * 60;
const localMidnight = (date: string) =>
  new Date(`${date}T00:00:00`).getTime() / 1_000;

describe("getDateRange", () => {
  it("leaves both sides open for any time", () => {
    expect(getDateRange({ period: "any", from: "", to: "" })).toEqual({
      after: null,
      before: null,
    });
  });

  it("starts a rolling window that many days ago", () => {
    const now = Math.floor(Date.now() / 1_000);
    const { after, before } = getDateRange({
      period: "14d",
      from: "",
      to: "",
    });

    expect(before).toBeNull();
    expect(now - (after ?? 0)).toBeGreaterThanOrEqual(14 * DAY_SECONDS - 1);
    expect(now - (after ?? 0)).toBeLessThanOrEqual(14 * DAY_SECONDS + 3_600);
  });

  it("includes the whole custom end day", () => {
    expect(
      getDateRange({ period: "custom", from: "2026-09-01", to: "2026-09-10" }),
    ).toEqual({
      after: localMidnight("2026-09-01"),
      before: localMidnight("2026-09-10") + DAY_SECONDS,
    });
  });

  it("leaves a custom side open when its date is empty", () => {
    expect(
      getDateRange({ period: "custom", from: "2026-09-01", to: "" }),
    ).toEqual({ after: localMidnight("2026-09-01"), before: null });
  });
});

describe("isDateFilterActive", () => {
  it("ignores a custom range with no dates", () => {
    expect(isDateFilterActive({ period: "custom", from: "", to: "" })).toBe(
      false,
    );
    expect(isDateFilterActive({ period: "7d", from: "", to: "" })).toBe(true);
  });
});
