import { describe, expect, it } from "bun:test";
import {
  getDisplaySemver,
  getReleaseNotesPath,
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

  it("getReleaseNotesPath nightly uses rolling tag", () => {
    expect(getReleaseNotesPath("0.19.0-nightly.20240513.05381793")).toBe(
      "/releases/tag/nightly",
    );
  });

  it("getReleaseNotesPath stable uses v prefix", () => {
    expect(getReleaseNotesPath("0.18.0")).toBe("/releases/tag/v0.18.0");
  });
});
