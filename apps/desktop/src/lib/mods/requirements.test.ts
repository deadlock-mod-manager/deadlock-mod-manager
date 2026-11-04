import { describe, expect, it } from "bun:test";
import type { ModDependency } from "@/types/dependencies";
import { ModStatus } from "@/types/mods";
import { requirementState, unmetRequirements } from "./requirements";

const required: ModDependency = {
  remoteId: "1",
  label: "Base skin",
  level: "required",
  url: "https://gamebanana.com/mods/1",
};
const enabled = {
  remoteId: "1",
  status: ModStatus.Installed,
  installedVpks: ["pak01_dir.vpk"],
};
describe("requirements in the active profile", () => {
  it("uses the complete submission identity", () => {
    expect(
      requirementState(required, [{ ...enabled, remoteId: "snd-1" }]),
    ).toBe("missing");
    expect(requirementState(required, [enabled])).toBe("met");
  });
  it("distinguishes a downloaded requirement from one ready to load", () => {
    expect(
      requirementState(required, [
        { ...enabled, status: ModStatus.Downloaded },
      ]),
    ).toBe("disabled");
    expect(
      requirementState(required, [{ ...enabled, missingVpks: ["base.vpk"] }]),
    ).toBe("disabled");
    expect(
      requirementState(required, [{ ...enabled, installedVpks: [] }]),
    ).toBe("disabled");
    expect(
      requirementState(required, [
        { ...enabled, status: ModStatus.Downloading },
      ]),
    ).toBe("missing");
  });
  it("keeps free text and external instructions unverified", () => {
    expect(requirementState({ ...required, remoteId: null }, [enabled])).toBe(
      "unverified",
    );
  });
  it("does not warn about optional recommendations or satisfied requirements", () => {
    expect(
      unmetRequirements([{ ...required, level: "recommended" }], []),
    ).toEqual([]);
    expect(unmetRequirements([required], [enabled])).toEqual([]);
    expect(unmetRequirements([required], [])).toEqual([required]);
  });
});

it("checks explicit disabled requirements without guessing from their names", () => {
  const negative = { ...required, mustBeDisabled: true };
  expect(requirementState(negative, [enabled])).toBe("shouldBeOff");
  expect(requirementState(negative, [])).toBe("met");
  expect(
    requirementState(negative, [{ ...enabled, status: ModStatus.Downloaded }]),
  ).toBe("met");
  expect(unmetRequirements([negative], [enabled])).toEqual([negative]);
  expect(unmetRequirements([negative], [])).toEqual([]);
});
