import { describe, expect, it } from "bun:test";
import { shouldShowNsfwBadgeAlongsideBlurPreview } from "./nsfw-blur-display";

describe("shouldShowNsfwBadgeAlongsideBlurPreview", () => {
  it("returns false when not NSFW", () => {
    expect(
      shouldShowNsfwBadgeAlongsideBlurPreview({
        disableBlur: false,
        isNSFW: false,
        shouldBlur: true,
      }),
    ).toBe(false);
  });

  it("returns false when blur overlay is active (NSFW blurred preview)", () => {
    expect(
      shouldShowNsfwBadgeAlongsideBlurPreview({
        disableBlur: false,
        isNSFW: true,
        shouldBlur: true,
      }),
    ).toBe(false);
  });

  it("returns true when blur is disabled (overlay badge not shown)", () => {
    expect(
      shouldShowNsfwBadgeAlongsideBlurPreview({
        disableBlur: true,
        isNSFW: true,
        shouldBlur: true,
      }),
    ).toBe(true);
  });

  it("returns true when preview is revealed (shouldBlur false)", () => {
    expect(
      shouldShowNsfwBadgeAlongsideBlurPreview({
        disableBlur: false,
        isNSFW: true,
        shouldBlur: false,
      }),
    ).toBe(true);
  });
});
