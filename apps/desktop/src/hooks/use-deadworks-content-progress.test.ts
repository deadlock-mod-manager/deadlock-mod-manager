import { describe, expect, it } from "bun:test";
import {
  type DeadworksContentProgress,
  contentProgressFraction,
} from "./use-deadworks-content-progress";

const base = (
  overrides: Partial<DeadworksContentProgress>,
): DeadworksContentProgress => ({
  status: "downloading",
  name: "bhop_asko",
  bytesDownloaded: 0,
  totalBytes: 0,
  itemIndex: 0,
  totalItems: 10,
  ...overrides,
});

describe("contentProgressFraction", () => {
  it("returns 0 when there are no items", () => {
    expect(contentProgressFraction(base({ totalItems: 0 }))).toBe(0);
  });

  it("uses item index when compressed size is unknown", () => {
    expect(
      contentProgressFraction(
        base({ status: "downloading", itemIndex: 4, totalBytes: 0 }),
      ),
    ).toBe(0.4);
  });

  it("adds per-file byte progress when size is known", () => {
    expect(
      contentProgressFraction(
        base({
          status: "downloading",
          itemIndex: 4,
          bytesDownloaded: 50,
          totalBytes: 100,
        }),
      ),
    ).toBe(0.45);
  });

  it("counts a ready item as complete even when size is 0", () => {
    expect(
      contentProgressFraction(
        base({ status: "ready", itemIndex: 4, totalBytes: 0 }),
      ),
    ).toBe(0.5);
  });

  it("does not treat decompressing as complete when size is unknown", () => {
    expect(
      contentProgressFraction(
        base({ status: "decompressing", itemIndex: 4, totalBytes: 0 }),
      ),
    ).toBe(0.4);
  });
});
