import { describe, expect, it } from "bun:test";
import type { ModHealth } from "@/types/generated/ModHealth";
import type { ModHealthReport } from "@/types/generated/ModHealthReport";
import type { ModHealthStatus } from "@/types/generated/ModHealthStatus";
import type { ModHealthSymptom } from "@/types/generated/ModHealthSymptom";
import {
  canFixInBulk,
  fixableModIds,
  gameUpdatedSinceLastCheck,
  healthAction,
  healthBadgeKind,
  isFixableStatus,
  launchFixDecision,
  mergeHealthChecks,
  showsDateOutdatedWarning,
} from "./mod-health";

const health = (
  modId: string,
  status: ModHealthStatus,
  remainingSymptoms: ModHealthSymptom[] = [],
): ModHealth => ({
  modId,
  status,
  symptoms: ["cameraAim", ...remainingSymptoms],
  fixSymptoms: ["cameraAim"],
  remainingSymptoms,
  repairs: 0,
  warnings: 0,
  gameBuild: 6200,
  checkedAt: "2026-10-17T12:00:00Z",
  source: "standalone",
});

const report = (
  mods: ModHealth[],
  builds: Pick<ModHealthReport, "gameBuild" | "previousGameBuild"> = {
    gameBuild: 6200,
    previousGameBuild: 6200,
  },
): ModHealthReport => ({ ...builds, mods });

const isEnabled = (modId: string) => modId.startsWith("enabled");

const request = (modIds: string[] | null, force = false) => ({
  profileFolder: "profile-1",
  modIds,
  force,
});

describe("healthBadgeKind", () => {
  it("badges only the statuses a player can act on or should know about", () => {
    for (const status of [
      "fixable",
      "partlyFixable",
      "fixed",
      "originalFiles",
      "needsUpdate",
    ] as const) {
      expect(healthBadgeKind(health("1", status))).toBe(status);
    }
    expect(healthBadgeKind(health("1", "works"))).toBeNull();
    expect(healthBadgeKind(health("1", "notCovered"))).toBeNull();
    expect(healthBadgeKind(undefined)).toBeNull();
  });

  it("marks a fixed mod with parts left over as partly fixed", () => {
    expect(healthBadgeKind(health("1", "fixed", ["animations"]))).toBe(
      "partlyFixed",
    );
  });
});

describe("healthAction", () => {
  it("offers a fix until the mod is fixed, then the way back", () => {
    expect(healthAction("fixable")).toBe("fix");
    expect(healthAction("partlyFixable")).toBe("fix");
    expect(healthAction("originalFiles")).toBe("fix");
    expect(healthAction("fixed")).toBe("useOriginalFiles");
    expect(healthAction("partlyFixed")).toBe("useOriginalFiles");
    expect(healthAction("needsUpdate")).toBeNull();
  });
});

describe("isFixableStatus", () => {
  it("covers full and partial fixes but never a player's opt-out", () => {
    expect(isFixableStatus("fixable")).toBe(true);
    expect(isFixableStatus("partlyFixable")).toBe(true);
    expect(isFixableStatus("originalFiles")).toBe(false);
    expect(isFixableStatus("fixed")).toBe(false);
    expect(isFixableStatus("needsUpdate")).toBe(false);
  });
});

describe("canFixInBulk", () => {
  it("leaves mods that can crash the game to a fix of their own", () => {
    expect(canFixInBulk(health("1", "fixable"))).toBe(true);
    expect(canFixInBulk(health("1", "partlyFixable", ["animations"]))).toBe(
      true,
    );
    expect(
      canFixInBulk(health("1", "partlyFixable", ["animations", "crashRisk"])),
    ).toBe(false);
    expect(canFixInBulk(health("1", "originalFiles"))).toBe(false);
  });
});

describe("showsDateOutdatedWarning", () => {
  it("falls back to the date while the check has nothing to say", () => {
    expect(showsDateOutdatedWarning(true, undefined)).toBe(true);
    expect(showsDateOutdatedWarning(true, health("1", "notCovered"))).toBe(
      true,
    );
  });

  it("defers to a finished check", () => {
    for (const status of [
      "works",
      "fixable",
      "partlyFixable",
      "fixed",
      "originalFiles",
      "needsUpdate",
    ] as const) {
      expect(showsDateOutdatedWarning(true, health("1", status))).toBe(false);
    }
  });

  it("never warns about mods updated after the cutoff", () => {
    expect(showsDateOutdatedWarning(false, undefined)).toBe(false);
    expect(showsDateOutdatedWarning(false, health("1", "notCovered"))).toBe(
      false,
    );
  });
});

describe("fixableModIds", () => {
  it("lists fully and partly fixable mods that pass the filter", () => {
    const mods = report([
      health("a", "fixable"),
      health("b", "fixed"),
      health("c", "partlyFixable", ["animations"]),
      health("d", "needsUpdate"),
      health("e", "originalFiles"),
      health("f", "partlyFixable", ["crashRisk"]),
    ]);
    expect(fixableModIds(mods)).toEqual(["a", "c"]);
    expect(fixableModIds(mods, (modId) => modId !== "a")).toEqual(["c"]);
    expect(fixableModIds(undefined)).toEqual([]);
  });
});

describe("gameUpdatedSinceLastCheck", () => {
  it("is true only when both builds are known and differ", () => {
    expect(
      gameUpdatedSinceLastCheck(
        report([], { gameBuild: 6201, previousGameBuild: 6200 }),
      ),
    ).toBe(true);
    expect(gameUpdatedSinceLastCheck(report([]))).toBe(false);
    expect(
      gameUpdatedSinceLastCheck(
        report([], { gameBuild: 6201, previousGameBuild: null }),
      ),
    ).toBe(false);
    expect(
      gameUpdatedSinceLastCheck(
        report([], { gameBuild: null, previousGameBuild: 6200 }),
      ),
    ).toBe(false);
    expect(gameUpdatedSinceLastCheck(undefined)).toBe(false);
  });
});

describe("launchFixDecision", () => {
  const mods = report([
    health("enabled-fixable", "fixable"),
    health("enabled-partly", "partlyFixable", ["model"]),
    health("disabled-fixable", "fixable"),
    health("enabled-fixed", "fixed"),
    health("enabled-original", "originalFiles"),
    health("enabled-crash", "partlyFixable", ["crashRisk"]),
  ]);

  it("launches straight away when no enabled mod needs a fix", () => {
    expect(
      launchFixDecision({
        report: report([health("enabled-fixed", "fixed")]),
        isEnabled,
        autoFixMods: true,
      }),
    ).toEqual({ action: "launch" });
    expect(
      launchFixDecision({ report: undefined, isEnabled, autoFixMods: false }),
    ).toEqual({ action: "launch" });
  });

  it("fixes enabled mods without asking when automatic fixes are on", () => {
    expect(
      launchFixDecision({ report: mods, isEnabled, autoFixMods: true }),
    ).toEqual({ action: "fix", modIds: ["enabled-fixable", "enabled-partly"] });
  });

  it("asks first when automatic fixes are off", () => {
    expect(
      launchFixDecision({ report: mods, isEnabled, autoFixMods: false }),
    ).toEqual({ action: "ask", modIds: ["enabled-fixable", "enabled-partly"] });
  });
});

describe("mergeHealthChecks", () => {
  it("takes the new request when nothing is queued", () => {
    expect(mergeHealthChecks(null, request(["a"]))).toEqual(request(["a"]));
  });

  it("unions narrowed requests and keeps a forced recheck", () => {
    expect(
      mergeHealthChecks(request(["a", "b"], true), request(["b", "c"])),
    ).toEqual(request(["a", "b", "c"], true));
  });

  it("widens to every mod when either request covers all of them", () => {
    expect(mergeHealthChecks(request(["a"]), request(null))).toEqual(
      request(null),
    );
    expect(mergeHealthChecks(request(null), request(["a"]))).toEqual(
      request(null),
    );
  });

  it("replaces a queued check for another profile", () => {
    const other = { profileFolder: "profile-2", modIds: null, force: true };
    expect(mergeHealthChecks(request(["a"]), other)).toEqual(other);
  });
});
