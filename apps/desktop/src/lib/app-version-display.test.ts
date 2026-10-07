import { describe, expect, it } from "bun:test";
import {
  getDisplaySemver,
  getReleaseNotesUrl,
  isNightlyBuildVersion,
} from "./app-version-display";

describe("app-version-display", () => {
  it("detects nightly pattern", () => {
    expect(isNightlyBuildVersion("0.19.0-nightly.20240513.05381793")).toBe(
      true,
    );
    expect(isNightlyBuildVersion("0.19.0-nightly.20240513.ABCDEF12")).toBe(
      true,
    );
  });

  it("rejects stable and malformed", () => {
    expect(isNightlyBuildVersion("0.18.0")).toBe(false);
    expect(isNightlyBuildVersion("0.19.0-nightly.x.invalid")).toBe(false);
    expect(isNightlyBuildVersion("")).toBe(false);
  });

  it("getDisplaySemver returns prefix for nightly", () => {
    expect(getDisplaySemver("0.19.0-nightly.20240513.05381793")).toBe("0.19.0");
  });

  it("getDisplaySemver passthrough for stable", () => {
    expect(getDisplaySemver("0.18.0")).toBe("0.18.0");
  });

  it("getReleaseNotesUrl sends nightlies to the rolling GitHub tag", () => {
    expect(getReleaseNotesUrl("0.19.0-nightly.20240513.05381793")).toBe(
      "https://github.com/deadlock-mod-manager/deadlock-mod-manager/releases/tag/nightly",
    );
  });

  it("getReleaseNotesUrl links releases to their website changelog entry", () => {
    expect(getReleaseNotesUrl("2.0.0")).toBe(
      "https://deadlockmods.app/changelog#v2.0.0",
    );
    expect(getReleaseNotesUrl()).toBe("https://deadlockmods.app/changelog");
  });
});
