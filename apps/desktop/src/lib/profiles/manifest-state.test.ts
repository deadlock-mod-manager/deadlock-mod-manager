import { describe, expect, it } from "bun:test";
import { ModStatus } from "@/types/mods";
import type { VpkManifestEntry } from "@/types/profiles";
import { projectManifestEntryToModState } from "./manifest-state";

const entry = (overrides: Partial<VpkManifestEntry>): VpkManifestEntry => ({
  enabled: true,
  desiredState: "enabled",
  diskState: "active",
  order: 0,
  currentVpks: ["pak01_dir.vpk"],
  disabledVpks: [],
  originalVpkNames: ["original.vpk"],
  ...overrides,
});

const project = (
  manifestEntry: VpkManifestEntry,
  enabledVpks: string[] = manifestEntry.currentVpks,
  allVpks: string[] = [...enabledVpks, ...manifestEntry.disabledVpks],
) =>
  projectManifestEntryToModState(manifestEntry, {
    enabledVpkSet: new Set(enabledVpks),
    allVpkSet: new Set(allVpks),
    fallbackInstallOrder: 77,
  });

describe("projectManifestEntryToModState", () => {
  it("projects active enabled entries as installed", () => {
    const projected = project(
      entry({
        currentVpks: ["pak09_dir.vpk"],
        order: 9,
      }),
    );

    expect(projected.status).toBe(ModStatus.Installed);
    expect(projected.installedVpks).toEqual(["pak09_dir.vpk"]);
    expect(projected.installOrder).toBe(9);
    expect(projected.repairReason).toBeUndefined();
  });

  it("trusts manifest mismatch over filename scan", () => {
    const projected = project(
      entry({
        diskState: "mismatch",
        repairReason: "fingerprintMismatch",
        currentVpks: ["pak11_dir.vpk"],
      }),
      ["pak11_dir.vpk"],
    );

    expect(projected.status).toBe(ModStatus.NeedsRepair);
    expect(projected.installedVpks).toEqual([]);
    expect(projected.repairReason).toBe("fingerprintMismatch");
  });

  it("trusts manifest unverified state over filename scan", () => {
    const projected = project(
      entry({
        diskState: "unverified",
        repairReason: "unverifiedManifest",
        currentVpks: ["pak12_dir.vpk"],
      }),
      ["pak12_dir.vpk"],
    );

    expect(projected.status).toBe(ModStatus.NeedsRepair);
    expect(projected.repairReason).toBe("unverifiedManifest");
  });

  it("marks enabled entries with missing payload as repairable", () => {
    const projected = project(
      entry({
        diskState: "missing",
        repairReason: "missingEnabledVpks",
      }),
      [],
    );

    expect(projected.status).toBe(ModStatus.NeedsRepair);
    expect(projected.repairReason).toBe("missingEnabledVpks");
  });

  it("projects disabled entries with prefixed payload as downloaded", () => {
    const projected = project(
      entry({
        enabled: false,
        desiredState: "disabled",
        diskState: "disabled",
        currentVpks: [],
        disabledVpks: ["123_pak01_dir.vpk"],
      }),
      [],
      ["123_pak01_dir.vpk"],
    );

    expect(projected.status).toBe(ModStatus.Downloaded);
    expect(projected.repairReason).toBeUndefined();
  });

  it("trusts manifest missing state for disabled entries even when scan sees a prefixed file", () => {
    const projected = project(
      entry({
        enabled: false,
        desiredState: "disabled",
        diskState: "missing",
        repairReason: "missingPayload",
        currentVpks: [],
        disabledVpks: ["123_pak01_dir.vpk"],
      }),
      [],
      ["123_pak01_dir.vpk"],
    );

    expect(projected.status).toBe(ModStatus.NeedsRepair);
    expect(projected.repairReason).toBe("missingPayload");
  });

  it("falls back to filename scan for legacy entries without disk state", () => {
    const projected = project(
      entry({
        diskState: undefined,
        desiredState: undefined,
        enabled: true,
        currentVpks: ["C:\\Deadlock\\addons\\pak14_dir.vpk"],
        order: null,
      }),
      ["pak14_dir.vpk"],
    );

    expect(projected.status).toBe(ModStatus.Installed);
    expect(projected.installedVpks).toEqual([
      "C:\\Deadlock\\addons\\pak14_dir.vpk",
    ]);
    expect(projected.installOrder).toBe(77);
  });
});
