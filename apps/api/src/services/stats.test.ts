import { describe, expect, it } from "bun:test";
import { countAppDownloads } from "./stats-counts";

describe("countAppDownloads", () => {
  it("sums release assets without catalog-derived downloads", () => {
    expect(
      countAppDownloads([
        { downloads: [{ downloadCount: 4 }, { downloadCount: 6 }] },
        { downloads: [{ downloadCount: 3 }] },
      ]),
    ).toBe(13);
  });
});
