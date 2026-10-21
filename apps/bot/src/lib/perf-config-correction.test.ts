import { describe, expect, it } from "bun:test";
import { PERFORMANCE_CONFIG_CATEGORY } from "@deadlock-mods/shared";
import {
  withoutPerformanceConfigCategory,
  withPerformanceConfigCategory,
} from "./perf-config-correction";

const downloads = [{ url: "https://example.com/fixed.zip", file: "fixed.zip" }];

describe("performance config corrections", () => {
  it("keeps an existing correction's other fields both ways", () => {
    const flagged = withPerformanceConfigCategory({ downloads });
    expect(flagged).toEqual({
      downloads,
      category: PERFORMANCE_CONFIG_CATEGORY,
    });
    expect(withoutPerformanceConfigCategory(flagged)).toEqual({ downloads });
  });

  it("leaves nothing to store when the flag was the whole correction", () => {
    expect(
      withoutPerformanceConfigCategory(withPerformanceConfigCategory(null)),
    ).toBeNull();
  });
});
