import type { ModHealth } from "@/types/generated/ModHealth";
import type { ModHealthReport } from "@/types/generated/ModHealthReport";
import type { ModHealthStatus } from "@/types/generated/ModHealthStatus";

/**
 * What a library badge says about a mod. "partlyFixed" is a fixed mod that
 * still has parts no repair covers.
 */
export type ModHealthBadgeKind =
  | "fixable"
  | "partlyFixable"
  | "fixed"
  | "partlyFixed"
  | "originalFiles"
  | "needsUpdate";

/**
 * Mods that work, or that the check can't judge, carry no health badge. A mod
 * its author updated after the latest game update is trusted over findings
 * no repair covers.
 */
export const healthBadgeKind = (
  health: ModHealth | undefined,
  isOutdated: boolean,
): ModHealthBadgeKind | null => {
  switch (health?.status) {
    case "fixed":
      return health.remainingSymptoms.length > 0 ? "partlyFixed" : "fixed";
    case "needsUpdate":
      return isOutdated ? "needsUpdate" : null;
    case "fixable":
    case "partlyFixable":
    case "originalFiles":
      return health.status;
    default:
      return null;
  }
};

export const healthAction = (
  kind: ModHealthBadgeKind,
): "fix" | "useOriginalFiles" | null => {
  switch (kind) {
    case "fixable":
    case "partlyFixable":
    case "originalFiles":
      return "fix";
    case "fixed":
    case "partlyFixed":
      return "useOriginalFiles";
    case "needsUpdate":
      return null;
  }
};

export const isFixableStatus = (status: ModHealthStatus): boolean =>
  status === "fixable" || status === "partlyFixable";

/**
 * A mod with model data issues is left out of fixes that run without showing
 * its issues, such as the banner button and the launch preflight.
 */
export const canFixInBulk = (health: ModHealth): boolean =>
  isFixableStatus(health.status) &&
  !health.remainingSymptoms.includes("crashRisk");

/**
 * A finished check knows more than the mod's last update date, so the date
 * warning only stands in while the check has nothing to say about the mod.
 */
export const showsDateOutdatedWarning = (
  isOutdated: boolean,
  health: ModHealth | undefined,
): boolean => isOutdated && (!health || health.status === "notCovered");

export const healthByModId = (
  report: ModHealthReport | undefined,
): ReadonlyMap<string, ModHealth> =>
  new Map(report?.mods.map((health) => [health.modId, health]) ?? []);

export const fixableModIds = (
  report: ModHealthReport | undefined,
  includes: (modId: string) => boolean = () => true,
): string[] =>
  report?.mods
    .filter((health) => canFixInBulk(health) && includes(health.modId))
    .map((health) => health.modId) ?? [];

export const gameUpdatedSinceLastCheck = (
  report: ModHealthReport | undefined,
): boolean =>
  !!report &&
  report.gameBuild !== null &&
  report.previousGameBuild !== null &&
  report.gameBuild !== report.previousGameBuild;

/** A fixable mod that automatic and banner fixes leave for the player to decide on. */
export const isHeldBack = (health: ModHealth): boolean =>
  isFixableStatus(health.status) && !canFixInBulk(health);

/**
 * Identifies one launch question about a held-back mod. It changes with the
 * game build or the mod's findings, so the player is asked again only then.
 */
export const heldBackPromptKey = (health: ModHealth): string =>
  [
    health.modId,
    health.gameBuild,
    health.fixSymptoms.join(","),
    health.remainingSymptoms.join(","),
  ].join("|");

export const heldBackToAsk = ({
  report,
  isEnabled,
  asked,
}: {
  report: ModHealthReport | undefined;
  isEnabled: (modId: string) => boolean;
  asked: ReadonlySet<string>;
}): ModHealth[] =>
  report?.mods.filter(
    (health) =>
      isHeldBack(health) &&
      isEnabled(health.modId) &&
      !asked.has(heldBackPromptKey(health)),
  ) ?? [];

type LaunchFixDecision =
  | { action: "launch" }
  | { action: "fix" | "ask"; modIds: string[] };

export const launchFixDecision = ({
  report,
  isEnabled,
  autoFixMods,
}: {
  report: ModHealthReport | undefined;
  isEnabled: (modId: string) => boolean;
  autoFixMods: boolean;
}): LaunchFixDecision => {
  const modIds = fixableModIds(report, isEnabled);
  if (modIds.length === 0) return { action: "launch" };
  return { action: autoFixMods ? "fix" : "ask", modIds };
};

export type ModHealthCheckRequest = {
  profileFolder: string | null;
  /** Null checks every mod in the profile. */
  modIds: string[] | null;
  force: boolean;
};

/** Folds a check requested while another runs into the one queued after it. */
export const mergeHealthChecks = (
  queued: ModHealthCheckRequest | null,
  next: ModHealthCheckRequest,
): ModHealthCheckRequest => {
  if (!queued || queued.profileFolder !== next.profileFolder) return next;
  return {
    profileFolder: next.profileFolder,
    modIds:
      queued.modIds && next.modIds
        ? [...new Set([...queued.modIds, ...next.modIds])]
        : null,
    force: queued.force || next.force,
  };
};
